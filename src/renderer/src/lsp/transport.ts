type JsonRpcMessage = {
  jsonrpc: '2.0'
  id?: number | string | null
  method?: string
  params?: unknown
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

export type RequestHandler = (params: unknown) => unknown | Promise<unknown>
export type NotificationHandler = (params: unknown) => void

const base64ToBytes = (b64: string): Uint8Array => {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

const stringToUtf8Bytes = (str: string): Uint8Array => new TextEncoder().encode(str)

const utf8BytesToString = (bytes: Uint8Array): string => new TextDecoder('utf-8').decode(bytes)

const concatBytes = (a: Uint8Array, b: Uint8Array): Uint8Array => {
  const out = new Uint8Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
  return out
}

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

const findHeaderEnd = (bytes: Uint8Array): number => {
  for (let i = 0; i + 3 < bytes.length; i += 1) {
    if (
      bytes[i] === 0x0d &&
      bytes[i + 1] === 0x0a &&
      bytes[i + 2] === 0x0d &&
      bytes[i + 3] === 0x0a
    ) {
      return i
    }
  }
  return -1
}

export type LspConnectionOptions = {
  serverId: string
  onNotification?: (method: string, params: unknown) => void
  onRequest?: (method: string, params: unknown) => unknown | Promise<unknown>
  onError?: (error: Error) => void
  onExit?: (info: { code: number | null; signal: string | null }) => void
  onStderr?: (text: string) => void
}

export class LspConnection {
  private buffer: Uint8Array<ArrayBufferLike> = new Uint8Array(0)
  private nextId = 1
  private pending = new Map<
    number | string,
    { resolve: (value: unknown) => void; reject: (reason: Error) => void }
  >()
  private notificationHandlers = new Map<string, Set<NotificationHandler>>()
  private requestHandlers = new Map<string, RequestHandler>()
  private disposeListeners: Array<() => void> = []
  private closed = false

  constructor(private readonly options: LspConnectionOptions) {
    const off1 = window.lsp.onData(options.serverId, (b64) => {
      this.handleIncomingChunk(base64ToBytes(b64))
    })
    const off2 = window.lsp.onStderr(options.serverId, (text) => {
      this.options.onStderr?.(text)
    })
    const off3 = window.lsp.onExit(options.serverId, (info) => {
      this.closed = true
      const error = new Error(`LSP server ${options.serverId} exited`)
      for (const pending of this.pending.values()) pending.reject(error)
      this.pending.clear()
      this.options.onExit?.(info)
    })
    this.disposeListeners.push(off1, off2, off3)
  }

  onNotification(method: string, handler: NotificationHandler): () => void {
    let set = this.notificationHandlers.get(method)
    if (!set) {
      set = new Set()
      this.notificationHandlers.set(method, set)
    }
    set.add(handler)
    return () => set?.delete(handler)
  }

  onRequest(method: string, handler: RequestHandler): void {
    this.requestHandlers.set(method, handler)
  }

  sendNotification(method: string, params?: unknown): void {
    if (this.closed) return
    this.writeMessage({ jsonrpc: '2.0', method, params })
  }

  sendRequest<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (this.closed) {
      return Promise.reject(new Error(`LSP server ${this.options.serverId} is not running`))
    }
    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject
      })
      this.writeMessage({ jsonrpc: '2.0', id, method, params })
    })
  }

  dispose(): void {
    if (this.closed) return
    this.closed = true
    for (const off of this.disposeListeners) {
      try {
        off()
      } catch {
        // ignore
      }
    }
    this.disposeListeners.length = 0
    for (const pending of this.pending.values()) {
      pending.reject(new Error(`LSP connection ${this.options.serverId} disposed`))
    }
    this.pending.clear()
    window.lsp.stop(this.options.serverId)
  }

  isClosed(): boolean {
    return this.closed
  }

  private writeMessage(message: JsonRpcMessage): void {
    const json = JSON.stringify(message)
    const body = stringToUtf8Bytes(json)
    const header = stringToUtf8Bytes(`Content-Length: ${body.length}\r\n\r\n`)
    const full = concatBytes(header, body)
    window.lsp.write(this.options.serverId, bytesToBase64(full))
  }

  private handleIncomingChunk(chunk: Uint8Array): void {
    this.buffer = concatBytes(this.buffer, chunk)
    while (true) {
      const headerEnd = findHeaderEnd(this.buffer)
      if (headerEnd === -1) return
      const headerBytes = this.buffer.subarray(0, headerEnd)
      const headerText = utf8BytesToString(headerBytes)
      const lengthMatch = /Content-Length:\s*(\d+)/i.exec(headerText)
      if (!lengthMatch) {
        this.options.onError?.(new Error('Missing Content-Length header in LSP message'))
        this.buffer = this.buffer.subarray(headerEnd + 4)
        continue
      }
      const contentLength = parseInt(lengthMatch[1], 10)
      const totalLength = headerEnd + 4 + contentLength
      if (this.buffer.length < totalLength) return
      const bodyBytes = this.buffer.subarray(headerEnd + 4, totalLength)
      this.buffer = this.buffer.subarray(totalLength)
      let parsed: JsonRpcMessage
      try {
        parsed = JSON.parse(utf8BytesToString(bodyBytes)) as JsonRpcMessage
      } catch (error) {
        this.options.onError?.(error instanceof Error ? error : new Error(String(error)))
        continue
      }
      void this.dispatch(parsed)
    }
  }

  private async dispatch(message: JsonRpcMessage): Promise<void> {
    if (message.id !== undefined && message.id !== null && message.method === undefined) {
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      if (message.error) {
        pending.reject(new Error(message.error.message || 'LSP error'))
        return
      }
      pending.resolve(message.result)
      return
    }

    if (message.method && (message.id === undefined || message.id === null)) {
      const handlers = this.notificationHandlers.get(message.method)
      if (handlers) {
        for (const handler of handlers) {
          try {
            handler(message.params)
          } catch (error) {
            this.options.onError?.(error instanceof Error ? error : new Error(String(error)))
          }
        }
      }
      this.options.onNotification?.(message.method, message.params)
      return
    }

    if (message.method && message.id !== undefined && message.id !== null) {
      const handler = this.requestHandlers.get(message.method)
      if (!handler) {
        this.writeMessage({
          jsonrpc: '2.0',
          id: message.id,
          error: { code: -32601, message: `Method not found: ${message.method}` }
        })
        return
      }
      try {
        const result = await handler(message.params)
        this.writeMessage({ jsonrpc: '2.0', id: message.id, result })
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error)
        this.writeMessage({
          jsonrpc: '2.0',
          id: message.id,
          error: { code: -32000, message: text }
        })
      }
    }
  }
}
