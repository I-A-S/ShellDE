import type { MouseEvent } from 'react'
import type { TermTab } from '../types'

type TerminalPanelProps = {
  termTabs: TermTab[]
  activeTermId: string | null
  fileTreePath?: string
  height: number
  onSelectTab: (id: string) => void
  onCloseTab: (event: MouseEvent, id: string) => void
  onCreateTerminal: (cwd?: string) => void
}

export function TerminalPanel({
  termTabs,
  activeTermId,
  fileTreePath,
  height,
  onSelectTab,
  onCloseTab,
  onCreateTerminal
}: TerminalPanelProps): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height,
        minHeight: '120px',
        flexShrink: 0,
        backgroundColor: '#1e1e1e',
        borderTop: '1px solid #444',
        overflow: 'hidden'
      }}
    >
      <div style={{ display: 'flex', backgroundColor: '#252526', borderBottom: '1px solid #333' }}>
        {termTabs.map((tab) => (
          <div
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 16px',
              backgroundColor: activeTermId === tab.id ? '#1e1e1e' : 'transparent',
              borderTop: activeTermId === tab.id ? '1px solid #007acc' : '1px solid transparent',
              cursor: 'pointer',
              fontSize: '13px',
              color: activeTermId === tab.id ? 'white' : '#888'
            }}
          >
            {tab.id === 'output' ? <i className="fa fa-list-alt" /> : <span>&gt;_</span>}{' '}
            {tab.title}
            {tab.closable && (
              <div onClick={(e) => onCloseTab(e, tab.id)} style={{ cursor: 'pointer' }}>
                ✕
              </div>
            )}
          </div>
        ))}
        <button
          onClick={() => onCreateTerminal(fileTreePath)}
          style={{
            marginLeft: 'auto',
            background: 'transparent',
            color: '#ccc',
            border: 'none',
            cursor: 'pointer',
            padding: '0 16px',
            fontSize: '16px'
          }}
        >
          +
        </button>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          padding: '4px',
          boxSizing: 'border-box'
        }}
      >
        {termTabs.map((tab) => (
          <div
            key={tab.id}
            id={`xterm-host-${tab.id}`}
            style={{
              height: '100%',
              width: '100%',
              display: activeTermId === tab.id ? 'block' : 'none'
            }}
          />
        ))}
        {termTabs.filter((tab) => tab.id !== 'output').length === 0 &&
          activeTermId !== 'output' && (
            <div
              style={{
                display: 'flex',
                height: '100%',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#555'
              }}
            >
              No active terminals. Click + to start one.
            </div>
          )}
      </div>
    </div>
  )
}
