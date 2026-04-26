import { useEffect, useRef } from 'react'

type ConfirmDialogProps = {
  isOpen: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  defaultAction?: 'cancel' | 'confirm'
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  defaultAction = 'cancel',
  onCancel,
  onConfirm
}: ConfirmDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null)
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!isOpen) return
    const timer = window.setTimeout(() => {
      if (defaultAction === 'confirm') confirmButtonRef.current?.focus()
      else cancelButtonRef.current?.focus()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [isOpen, defaultAction])

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
        <div style={{ fontSize: '14px', marginBottom: '8px', fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
          {message}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button
            ref={cancelButtonRef}
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
            {cancelLabel}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={onConfirm}
            style={{
              minWidth: '88px',
              padding: '8px 12px',
              borderRadius: '7px',
              border: '1px solid #cc6b2c',
              background: 'linear-gradient(180deg, #e17b34 0%, #cc6b2c 100%)',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 700
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
