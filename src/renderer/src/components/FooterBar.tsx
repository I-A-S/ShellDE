type FooterBarProps = {
  workspaceName: string
  line: number
  column: number
  language?: string
  encoding?: string
}

export function FooterBar({
  workspaceName,
  line,
  column,
  language = 'plaintext',
  encoding = 'UTF-8'
}: FooterBarProps): JSX.Element {
  return (
    <div
      style={{
        height: '24px',
        background: 'var(--color-accent)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 10px',
        fontSize: '12px'
      }}
    >
      <div
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: '55%',
          paddingLeft: '6px'
        }}
      >
        {workspaceName}
      </div>
      <div>
        Ln {line}, Col {column} | {language} | {encoding}
      </div>
    </div>
  )
}
