import type { CSSProperties, MouseEvent } from 'react'

type AppMenuId = 'file' | 'edit' | 'selection' | 'view' | 'help'

type TitleBarProps = {
  appIcon: string
  isTopMenuExpanded: boolean
  isWindowMaximized: boolean
  onToggleMenu: () => void
  onOpenMenu: (menuId: AppMenuId, event: MouseEvent<HTMLButtonElement>) => void
  onMinimize: () => void
  onToggleMaximize: () => void
  onClose: () => void
}

const menuItems: AppMenuId[] = ['file', 'edit', 'selection', 'view', 'help']

export function TitleBar({
  appIcon,
  isTopMenuExpanded,
  isWindowMaximized,
  onToggleMenu,
  onOpenMenu,
  onMinimize,
  onToggleMaximize,
  onClose
}: TitleBarProps): JSX.Element {
  return (
    <div
      style={
        {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '36px',
          background: 'var(--color-titlebar)',
          borderBottom: '1px solid var(--color-border)',
          WebkitAppRegion: 'drag'
        } as CSSProperties
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingLeft: '10px' }}>
        <img src={appIcon} alt="App Icon" style={{ width: '16px', height: '16px' }} />
        <button
          onClick={onToggleMenu}
          title="Menu"
          aria-label="Menu"
          style={
            {
              background: 'transparent',
              border: 'none',
              color: 'var(--color-text)',
              fontSize: '14px',
              cursor: 'pointer',
              padding: '4px 8px',
              WebkitAppRegion: 'no-drag'
            } as CSSProperties
          }
        >
          <i className="fa fa-bars" />
        </button>
        {isTopMenuExpanded &&
          menuItems.map((menuId) => (
            <button
              key={menuId}
              onClick={(event) => onOpenMenu(menuId, event)}
              style={
                {
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--color-text)',
                  fontSize: '13px',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  textTransform: 'capitalize',
                  WebkitAppRegion: 'no-drag'
                } as CSSProperties
              }
            >
              {menuId}
            </button>
          ))}
      </div>
      <div
        style={
          { display: 'flex', alignItems: 'stretch', WebkitAppRegion: 'no-drag' } as CSSProperties
        }
      >
        <button
          onClick={onMinimize}
          style={{
            width: '46px',
            border: 'none',
            background: 'transparent',
            color: 'var(--color-text)',
            cursor: 'pointer'
          }}
        >
          <i className="fa fa-minus" style={{ fontSize: '13px' }} />
        </button>
        <button
          onClick={onToggleMaximize}
          style={{
            width: '46px',
            border: 'none',
            background: 'transparent',
            color: 'var(--color-text)',
            cursor: 'pointer'
          }}
        >
          {isWindowMaximized ? '❐' : '□'}
        </button>
        <button
          onClick={onClose}
          style={{
            width: '46px',
            border: 'none',
            background: 'transparent',
            color: '#ddd',
            cursor: 'pointer'
          }}
        >
          ✕
        </button>
      </div>
    </div>
  )
}
