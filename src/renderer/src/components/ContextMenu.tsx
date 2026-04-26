type ContextMenuProps = {
  x: number
  y: number
  hasContextNode: boolean
  hasClipboard: boolean
  onAction: (
    action: 'new-file' | 'new-folder' | 'rename' | 'delete' | 'copy' | 'cut' | 'paste' | 'refresh'
  ) => void
}

export function ContextMenu({
  x,
  y,
  hasContextNode,
  hasClipboard,
  onAction
}: ContextMenuProps): JSX.Element {
  return (
    <div
      style={{
        position: 'fixed',
        top: y,
        left: x,
        background: 'var(--color-surface-elevated)',
        border: '1px solid var(--color-border)',
        borderRadius: '6px',
        boxShadow: '0 10px 20px rgba(0, 0, 0, 0.35)',
        zIndex: 2000,
        minWidth: '170px',
        padding: '6px 0'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        onClick={() => onAction('new-file')}
        style={{ padding: '7px 12px', cursor: 'pointer', fontSize: '13px' }}
      >
        New File
      </div>
      <div
        onClick={() => onAction('new-folder')}
        style={{ padding: '7px 12px', cursor: 'pointer', fontSize: '13px' }}
      >
        New Folder
      </div>
      <div style={{ borderTop: '1px solid var(--color-border)', margin: '4px 0' }} />
      <div
        onClick={() => onAction('rename')}
        style={{
          padding: '7px 12px',
          cursor: hasContextNode ? 'pointer' : 'not-allowed',
          opacity: hasContextNode ? 1 : 0.5,
          fontSize: '13px'
        }}
      >
        Rename
      </div>
      <div
        onClick={() => onAction('delete')}
        style={{
          padding: '7px 12px',
          cursor: hasContextNode ? 'pointer' : 'not-allowed',
          opacity: hasContextNode ? 1 : 0.5,
          fontSize: '13px'
        }}
      >
        Delete
      </div>
      <div style={{ borderTop: '1px solid var(--color-border)', margin: '4px 0' }} />
      <div
        onClick={() => onAction('copy')}
        style={{
          padding: '7px 12px',
          cursor: hasContextNode ? 'pointer' : 'not-allowed',
          opacity: hasContextNode ? 1 : 0.5,
          fontSize: '13px'
        }}
      >
        Copy
      </div>
      <div
        onClick={() => onAction('cut')}
        style={{
          padding: '7px 12px',
          cursor: hasContextNode ? 'pointer' : 'not-allowed',
          opacity: hasContextNode ? 1 : 0.5,
          fontSize: '13px'
        }}
      >
        Cut
      </div>
      <div
        onClick={() => onAction('paste')}
        style={{
          padding: '7px 12px',
          cursor: hasClipboard ? 'pointer' : 'not-allowed',
          opacity: hasClipboard ? 1 : 0.5,
          fontSize: '13px'
        }}
      >
        Paste
      </div>
      <div style={{ borderTop: '1px solid var(--color-border)', margin: '4px 0' }} />
      <div
        onClick={() => onAction('refresh')}
        style={{ padding: '7px 12px', cursor: 'pointer', fontSize: '13px' }}
      >
        Refresh
      </div>
    </div>
  )
}
