import type { MouseEvent } from 'react'
import type { Tab } from '../types'

type EditorTabsProps = {
  tabs: Tab[]
  activeTabPath: string | null
  onSelectTab: (path: string) => void
  onCloseTab: (event: MouseEvent, path: string) => void
}

export function EditorTabs({
  tabs,
  activeTabPath,
  onSelectTab,
  onCloseTab
}: EditorTabsProps): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        backgroundColor: 'var(--color-surface-2)',
        overflowX: 'auto'
      }}
    >
      {tabs.map((tab) => (
        <div
          key={tab.path}
          onClick={() => onSelectTab(tab.path)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            backgroundColor:
              activeTabPath === tab.path ? 'var(--color-bg)' : 'var(--color-tab-inactive)',
            borderTop: activeTabPath === tab.path ? '1px solid #007acc' : '1px solid transparent',
            borderRight: '1px solid var(--color-bg)',
            cursor: 'pointer',
            fontSize: '13px',
            color: activeTabPath === tab.path ? 'var(--color-text)' : 'var(--color-text-muted)'
          }}
        >
          {tab.content !== tab.savedContent && (
            <i className="fa fa-circle" style={{ fontSize: '7px', color: '#d7ba7d' }} />
          )}
          {tab.name}
          <div
            onClick={(event) => onCloseTab(event, tab.path)}
            style={{
              borderRadius: '4px',
              width: '18px',
              height: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'transparent'
            }}
            onMouseEnter={(event) => (event.currentTarget.style.backgroundColor = '#444')}
            onMouseLeave={(event) => (event.currentTarget.style.backgroundColor = 'transparent')}
          >
            ✕
          </div>
        </div>
      ))}
    </div>
  )
}
