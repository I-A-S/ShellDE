type ErrorToastProps = {
  message: string | null
  onClose: () => void
}

export function ErrorToast({ message, onClose }: ErrorToastProps): JSX.Element | null {
  if (!message) return null
  return (
    <div
      style={{
        position: 'fixed',
        right: '16px',
        bottom: '16px',
        background: 'var(--color-error)',
        color: '#fff',
        padding: '10px 12px',
        borderRadius: '6px',
        zIndex: 2200
      }}
    >
      {message}
      <button
        onClick={onClose}
        style={{
          marginLeft: '12px',
          border: 'none',
          background: 'transparent',
          color: '#fff',
          cursor: 'pointer'
        }}
      >
        ✕
      </button>
    </div>
  )
}
