import Editor from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import type { editor as MonacoEditor } from 'monaco-editor'
import type { MutableRefObject } from 'react'
import type { Tab } from '../types'
import { getLanguage } from '../utils/editor'

type EditorPaneProps = {
  activeTab: Tab | undefined
  monacoEditorRef: MutableRefObject<MonacoEditor.IStandaloneCodeEditor | null>
  onEditorChange: (value: string | undefined) => void
  onCursorChange: (line: number, column: number) => void
}

export function EditorPane({
  activeTab,
  monacoEditorRef,
  onEditorChange,
  onCursorChange
}: EditorPaneProps): JSX.Element {
  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {activeTab ? (
        <Editor
          height="100%"
          path={monaco.Uri.file(activeTab.path).toString()}
          language={getLanguage(activeTab.name)}
          theme="vs-dark"
          value={activeTab.content}
          onChange={onEditorChange}
          onMount={(editorInstance: MonacoEditor.IStandaloneCodeEditor) => {
            monacoEditorRef.current = editorInstance
            const position = editorInstance.getPosition()
            if (position) {
              onCursorChange(position.lineNumber, position.column)
            }
            editorInstance.onDidChangeCursorPosition((event) => {
              onCursorChange(event.position.lineNumber, event.position.column)
            })
          }}
          options={{ minimap: { enabled: false }, fontSize: 14 }}
        />
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#555',
            fontSize: '24px'
          }}
        >
          Open a file to start editing
        </div>
      )}
    </div>
  )
}
