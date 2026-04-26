/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import type { TermTab } from '../types'

type UseTerminalManagerParams = {
  workspacePath: string | undefined
  terminalHeight: number
}

type UseTerminalManagerResult = {
  termTabs: TermTab[]
  activeTermId: string | null
  setActiveTermId: (id: string | null) => void
  createTerminal: (cwd?: string) => Promise<void>
  closeTerminal: (event: MouseEvent, idToClose: string) => void
  appendOutputLine: (message: string) => void
}

export function useTerminalManager({
  workspacePath,
  terminalHeight
}: UseTerminalManagerParams): UseTerminalManagerResult {
  const [termTabs, setTermTabs] = useState<TermTab[]>([{ id: 'output', title: 'Output', closable: false }])
  const [activeTermId, setActiveTermId] = useState<string | null>('output')
  const [outputLines, setOutputLines] = useState<string[]>([])
  const xtermInstances = useRef<Record<string, { term: Terminal; fit: FitAddon }>>({})
  const initializedTerminalRef = useRef(false)

  const createTerminal = async (cwd?: string) => {
    if (termTabs.some((tab) => tab.id !== 'output' && tab.title === 'Starting...')) return
    const id = `term-${Date.now()}`
    const shellName = await window.api.spawnTerminal(id, cwd)
    setTermTabs((prev) => [...prev, { id, title: shellName, closable: true }])
    setActiveTermId(id)
  }

  const closeTerminal = (event: MouseEvent, idToClose: string) => {
    event.stopPropagation()
    window.api.killTerminal(idToClose)
    delete xtermInstances.current[idToClose]

    setTermTabs((prev) => {
      const newTabs = prev.filter((tab) => tab.id !== idToClose)
      if (activeTermId === idToClose) {
        setActiveTermId(newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null)
      }
      return newTabs
    })
  }

  const appendOutputLine = (message: string) => {
    setOutputLines((prev) => [...prev.slice(-500), `${message}\n`])
  }

  useEffect(() => {
    window.api.onTerminalOutput((data: string) => {
      setOutputLines((prev) => [...prev.slice(-500), data])
      if (xtermInstances.current.output) {
        xtermInstances.current.output.term.write(data)
      }
    })
  }, [])

  useEffect(() => {
    if (!initializedTerminalRef.current) {
      initializedTerminalRef.current = true
      void createTerminal(workspacePath)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    termTabs.forEach((tab) => {
      if (!xtermInstances.current[tab.id]) {
        const termNode = document.getElementById(`xterm-host-${tab.id}`)
        if (termNode) {
          const term = new Terminal({
            theme: { background: '#1e1e1e' },
            fontFamily: 'monospace',
            cursorBlink: tab.id !== 'output',
            disableStdin: tab.id === 'output'
          })
          const fitAddon = new FitAddon()
          term.loadAddon(fitAddon)
          term.open(termNode)
          fitAddon.fit()

          if (tab.id === 'output') {
            term.write(outputLines.join('') || 'Output panel ready.\r\n')
          } else {
            term.onData((data) => {
              window.api.writeTerminal(tab.id, data)
            })

            window.api.onTerminalData(tab.id, (data: string) => {
              term.write(data)
            })

            term.onResize((size) => {
              window.api.resizeTerminal(tab.id, size.cols, size.rows)
            })
          }

          xtermInstances.current[tab.id] = { term, fit: fitAddon }
        }
      }
    })
  }, [termTabs, outputLines])

  useEffect(() => {
    if (!workspacePath) return
    for (const terminal of termTabs.filter((item) => item.id !== 'output')) {
      window.api.writeTerminal(terminal.id, `cd "${workspacePath}"\r`)
    }
  }, [workspacePath, termTabs])

  useEffect(() => {
    if (activeTermId && xtermInstances.current[activeTermId]) {
      setTimeout(() => xtermInstances.current[activeTermId].fit.fit(), 50)
    }

    const handleResize = () => {
      if (activeTermId && xtermInstances.current[activeTermId]) {
        xtermInstances.current[activeTermId].fit.fit()
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [activeTermId])

  useEffect(() => {
    if (!activeTermId || !xtermInstances.current[activeTermId]) return
    setTimeout(() => xtermInstances.current[activeTermId].fit.fit(), 0)
  }, [activeTermId, terminalHeight])

  return {
    termTabs,
    activeTermId,
    setActiveTermId,
    createTerminal,
    closeTerminal,
    appendOutputLine
  }
}
