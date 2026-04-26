import type { MouseEvent } from 'react'
import { FileTreeNode } from './FileTreeNode'
import type { SearchResult, SelectedNode, TreeNode } from '../types'

type LeftPaneProps = {
  fileTree: TreeNode | null
  leftPaneTab: 'workspace' | 'search'
  selectedNode: SelectedNode | null
  searchQuery: string
  replaceQuery: string
  searchResults: SearchResult[]
  onLeftPaneTabChange: (tab: 'workspace' | 'search') => void
  onSearchQueryChange: (value: string) => void
  onReplaceQueryChange: (value: string) => void
  onCreateFile: () => void
  onCreateFolder: () => void
  onOpenWorkspace: () => void
  onOpenSearchResult: (path: string) => void
  onFind: () => void
  onReplaceAll: () => void
  onOpenContextMenu: (
    event: MouseEvent<HTMLDivElement>,
    node: TreeNode | null,
    parentPath: string | null
  ) => void
  onSelectNode: (node: TreeNode, parentPath: string) => void
  onFileClick: (filePath: string, fileName: string) => void
}

export function LeftPane({
  fileTree,
  leftPaneTab,
  selectedNode,
  searchQuery,
  replaceQuery,
  searchResults,
  onLeftPaneTabChange,
  onSearchQueryChange,
  onReplaceQueryChange,
  onCreateFile,
  onCreateFolder,
  onOpenWorkspace,
  onOpenSearchResult,
  onFind,
  onReplaceAll,
  onOpenContextMenu,
  onSelectNode,
  onFileClick
}: LeftPaneProps): JSX.Element {
  const canUseSearch = Boolean(fileTree)

  return (
    <div
      style={{
        width: '100%',
        background: '#252526',
        borderRight: '1px solid #333',
        overflowY: 'auto',
        paddingTop: '8px',
        display: 'flex',
        flexDirection: 'column'
      }}
      onContextMenu={(event) => {
        if (!fileTree || leftPaneTab !== 'workspace') return
        if (event.currentTarget !== event.target) return
        event.preventDefault()
        onOpenContextMenu(event, null, null)
      }}
    >
      <div style={{ display: 'flex', borderBottom: '1px solid #333', marginBottom: '8px' }}>
        <button
          onClick={() => onLeftPaneTabChange('workspace')}
          style={{
            flex: 1,
            background: leftPaneTab === 'workspace' ? '#1e1e1e' : 'transparent',
            border: 'none',
            color: '#ccc',
            padding: '8px',
            cursor: 'pointer'
          }}
        >
          <i className="fa fa-folder-open-o" style={{ marginRight: '6px' }} />
          Workspace
        </button>
        <button
          onClick={() => {
            if (canUseSearch) onLeftPaneTabChange('search')
          }}
          disabled={!canUseSearch}
          style={{
            flex: 1,
            background: leftPaneTab === 'search' ? '#1e1e1e' : 'transparent',
            border: 'none',
            color: canUseSearch ? '#ccc' : '#666',
            padding: '8px',
            cursor: canUseSearch ? 'pointer' : 'not-allowed',
            opacity: canUseSearch ? 1 : 0.75
          }}
        >
          <i className="fa fa-search" style={{ marginRight: '6px' }} />
          Search
        </button>
      </div>

      {leftPaneTab === 'workspace' || !canUseSearch ? (
        <>
          <div
            style={{
              padding: '0 8px 8px 8px',
              fontSize: '11px',
              color: '#888',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid #333',
              marginBottom: '8px'
            }}
          >
            <span
              title={fileTree?.name || 'Workspace'}
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '190px',
                paddingLeft: '4px'
              }}
            >
              {fileTree?.name || 'Workspace'}
            </span>
            {fileTree && (
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  onClick={onCreateFile}
                  title="New File"
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: '#ccc',
                    cursor: 'pointer'
                  }}
                >
                  <i className="fa fa-file-o" />
                </button>
                <button
                  onClick={onCreateFolder}
                  title="New Folder"
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: '#ccc',
                    cursor: 'pointer'
                  }}
                >
                  <i className="fa fa-folder-o" />
                </button>
              </div>
            )}
          </div>
          {fileTree ? (
            fileTree.children?.map((child) => (
              <FileTreeNode
                key={child.path}
                node={child}
                parentPath={fileTree.path}
                selectedPath={selectedNode?.node.path ?? null}
                onSelect={onSelectNode}
                onFileClick={onFileClick}
                onContextMenu={onOpenContextMenu}
                depth={0}
              />
            ))
          ) : (
            <div
              style={{
                padding: '20px',
                color: '#666',
                fontSize: '13px',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                alignItems: 'center',
                justifyContent: 'center',
                flex: 1
              }}
            >
              <span>No workspace open</span>
              <button
                onClick={onOpenWorkspace}
                style={{
                  padding: '6px 10px',
                  border: '1px solid #555',
                  borderRadius: '4px',
                  background: '#333',
                  color: '#ddd',
                  cursor: 'pointer'
                }}
              >
                Open Workspace
              </button>
            </div>
          )}
        </>
      ) : (
        <div style={{ padding: '10px' }}>
          <div style={{ fontSize: '12px', marginBottom: '6px', color: '#bbb' }}>Find</div>
          <input
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            placeholder="Search text"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              marginBottom: '8px',
              padding: '6px',
              background: '#1e1e1e',
              color: '#ddd',
              border: '1px solid #444'
            }}
          />
          <div style={{ fontSize: '12px', marginBottom: '6px', color: '#bbb' }}>Replace</div>
          <input
            value={replaceQuery}
            onChange={(e) => onReplaceQueryChange(e.target.value)}
            placeholder="Replace text"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              marginBottom: '8px',
              padding: '6px',
              background: '#1e1e1e',
              color: '#ddd',
              border: '1px solid #444'
            }}
          />
          <div style={{ display: 'flex', gap: '8px', marginTop: '14px', marginBottom: '12px' }}>
            <button
              onClick={onFind}
              style={{
                border: '1px solid #2f6feb',
                background: '#2f6feb',
                color: '#fff',
                borderRadius: '4px',
                padding: '6px 10px',
                cursor: 'pointer'
              }}
            >
              <i className="fa fa-search" style={{ marginRight: '6px' }} />
              Find
            </button>
            <button
              onClick={onReplaceAll}
              style={{
                border: '1px solid #0f766e',
                background: '#0f766e',
                color: '#fff',
                borderRadius: '4px',
                padding: '6px 10px',
                cursor: 'pointer'
              }}
            >
              <i className="fa fa-exchange" style={{ marginRight: '6px' }} />
              Replace All
            </button>
          </div>
          <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '6px' }}>
            Results ({searchResults.length})
          </div>
          <div>
            {searchResults.map((result) => (
              <div
                key={result.path}
                onClick={() => onOpenSearchResult(result.path)}
                style={{
                  padding: '6px',
                  borderBottom: '1px solid #333',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                <div style={{ color: '#ddd' }}>{result.path.split(/[\\/]/).slice(-1)[0]}</div>
                <div style={{ color: '#888', fontSize: '11px' }}>{result.count} matches</div>
                {result.matches.slice(0, 2).map((match) => (
                  <div
                    key={`${result.path}-${match.line}`}
                    style={{ color: '#9aa0a6', fontSize: '11px' }}
                  >
                    {match.line}: {match.preview}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
