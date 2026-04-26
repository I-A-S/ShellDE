// Standalone smoke test: spawns pyright via the same launcher our manager uses,
// runs the LSP initialize handshake, and verifies type-check diagnostics reach us.
//
// Run with: node scripts/lsp-smoke.cjs
const { spawn } = require('child_process')
const path = require('path')

const launcher = path.join(
  path.dirname(require.resolve('pyright/package.json')),
  'langserver.index.js'
)

const child = spawn(process.execPath, [launcher, '--stdio'], {
  stdio: ['pipe', 'pipe', 'pipe']
})

let stdoutBuffer = Buffer.alloc(0)
let nextId = 1
const pending = new Map()
const notificationHandlers = new Map()

const send = (msg) => {
  const body = Buffer.from(JSON.stringify(msg), 'utf-8')
  const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'utf-8')
  child.stdin.write(Buffer.concat([header, body]))
}

const sendRequest = (method, params) =>
  new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    send({ jsonrpc: '2.0', id, method, params })
  })

const sendNotification = (method, params) => send({ jsonrpc: '2.0', method, params })

const onNotification = (method, handler) => notificationHandlers.set(method, handler)

child.stdout.on('data', (chunk) => {
  stdoutBuffer = Buffer.concat([stdoutBuffer, chunk])
  while (true) {
    const headerEnd = stdoutBuffer.indexOf('\r\n\r\n')
    if (headerEnd === -1) return
    const headerText = stdoutBuffer.slice(0, headerEnd).toString('utf-8')
    const lengthMatch = /Content-Length:\s*(\d+)/i.exec(headerText)
    if (!lengthMatch) return
    const total = headerEnd + 4 + parseInt(lengthMatch[1], 10)
    if (stdoutBuffer.length < total) return
    const body = stdoutBuffer.slice(headerEnd + 4, total).toString('utf-8')
    stdoutBuffer = stdoutBuffer.slice(total)
    let parsed
    try {
      parsed = JSON.parse(body)
    } catch (error) {
      console.error('JSON parse error:', error)
      continue
    }
    if (parsed.id !== undefined && parsed.method === undefined) {
      const handler = pending.get(parsed.id)
      pending.delete(parsed.id)
      if (parsed.error) handler.reject(new Error(parsed.error.message))
      else handler.resolve(parsed.result)
    } else if (parsed.method && parsed.id === undefined) {
      console.log(`[notif] ${parsed.method}`, JSON.stringify(parsed.params).slice(0, 200))
      const handler = notificationHandlers.get(parsed.method)
      if (handler) handler(parsed.params)
    } else if (parsed.method && parsed.id !== undefined) {
      console.log(`[req ${parsed.id}] ${parsed.method}`, JSON.stringify(parsed.params).slice(0, 200))
      if (parsed.method === 'workspace/configuration') {
        send({ jsonrpc: '2.0', id: parsed.id, result: parsed.params.items.map(() => null) })
      } else {
        send({ jsonrpc: '2.0', id: parsed.id, result: null })
      }
    }
  }
})

child.stderr.on('data', (data) => process.stderr.write(`[pyright stderr] ${data}`))

const fs = require('fs')
const os = require('os')

const tmpDir = path.join(os.tmpdir(), `lsp-smoke-${Date.now()}`)
fs.mkdirSync(tmpDir, { recursive: true })
const tmpFile = path.join(tmpDir, 'lsp-smoke.py')
const sample = `x: int = "hi"\n`
fs.writeFileSync(tmpFile, sample, 'utf-8')
const fileUri = `file:///${tmpFile.replace(/\\/g, '/')}`
const rootUri = `file:///${tmpDir.replace(/\\/g, '/')}`
console.log('Workspace:', rootUri)
console.log('File:', fileUri)

;(async () => {
  const timeoutHandle = setTimeout(() => {
    console.error('Timed out waiting for diagnostics')
    process.exit(1)
  }, 15000)

  const initResult = await sendRequest('initialize', {
    processId: process.pid,
    clientInfo: { name: 'lsp-smoke', version: '1.0.0' },
    rootUri,
    workspaceFolders: [{ uri: rootUri, name: 'smoke' }],
    initializationOptions: {
      python: {
        analysis: {
          autoSearchPaths: true,
          useLibraryCodeForTypes: true,
          diagnosticMode: 'workspace',
          typeCheckingMode: 'basic'
        }
      }
    },
    capabilities: {
      workspace: {
        configuration: true,
        workspaceFolders: true,
        didChangeConfiguration: { dynamicRegistration: false }
      },
      textDocument: {
        publishDiagnostics: { relatedInformation: true }
      }
    }
  })
  console.log('Initialize OK. Server:', initResult.serverInfo?.name)

  sendNotification('initialized', {})
  sendNotification('workspace/didChangeConfiguration', { settings: {} })

  const normalize = (uri) => decodeURIComponent(uri).toLowerCase()
  const diagPromise = new Promise((resolve) => {
    onNotification('textDocument/publishDiagnostics', (params) => {
      if (normalize(params.uri) === normalize(fileUri) && params.diagnostics.length > 0) {
        resolve(params.diagnostics)
      }
    })
  })

  sendNotification('textDocument/didOpen', {
    textDocument: { uri: fileUri, languageId: 'python', version: 1, text: sample }
  })

  const diagnostics = await diagPromise
  clearTimeout(timeoutHandle)

  console.log(`Got ${diagnostics.length} diagnostic(s):`)
  for (const diag of diagnostics) {
    console.log(`  - [${diag.severity}] ${diag.message}`)
  }

  if (diagnostics.length === 0) {
    console.error('FAIL: expected at least one diagnostic for `x: int = "hi"`')
    process.exit(1)
  }
  if (!diagnostics.some((d) => /str|int/i.test(d.message))) {
    console.error('FAIL: expected diagnostic mentioning a type mismatch')
    process.exit(1)
  }

  console.log('PASS: pyright diagnostics flow end-to-end.')

  await sendRequest('shutdown', null)
  sendNotification('exit', null)
  setTimeout(() => process.exit(0), 200)
})().catch((error) => {
  console.error('Smoke test failed:', error)
  process.exit(1)
})
