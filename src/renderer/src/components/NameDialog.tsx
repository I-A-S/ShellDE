type NameDialogProps = {
  isOpen: boolean
  title: string
  value: string
  placeholder: string
  onValueChange: (value: string) => void
  onCancel: () => void
  onConfirm: () => void
}

export function NameDialog({
  isOpen,
  title,
  value,
  placeholder,
  onValueChange,
  onCancel,
  onConfirm
}: NameDialogProps): JSX.Element | null {
  if (!isOpen) return null
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 2100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <div
        style={{
          width: '360px',
          background: 'var(--color-surface-elevated)',
          border: '1px solid var(--color-border)',
          borderRadius: '10px',
          boxShadow: '0 16px 36px rgba(0,0,0,0.45)',
          padding: '18px'
        }}
      >
        <div style={{ fontSize: '14px', marginBottom: '12px', fontWeight: 700 }}>{title}</div>
        <input
          autoFocus
          value={value}
          placeholder={placeholder}
          onChange={(e) => onValueChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onConfirm()
          }}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '8px 10px',
            background: 'var(--color-surface-2)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
            borderRadius: '7px',
            outline: 'none'
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              minWidth: '88px',
              padding: '8px 12px',
              borderRadius: '7px',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface-2)',
              color: 'var(--color-text)',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              minWidth: '88px',
              padding: '8px 12px',
              borderRadius: '7px',
              border: '1px solid #0e5ca9',
              background: 'linear-gradient(180deg, #2382dc 0%, #0f6bc3 100%)',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 700
            }}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  )
}
