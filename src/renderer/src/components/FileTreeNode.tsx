import { useState, type CSSProperties, type MouseEvent } from 'react'
import type { TreeNode } from '../types'

type FileTreeNodeProps = {
  node: TreeNode
  parentPath: string
  selectedPath: string | null
  onSelect: (node: TreeNode, parentPath: string) => void
  onFileClick: (filePath: string, fileName: string) => void
  onContextMenu: (event: MouseEvent<HTMLDivElement>, node: TreeNode, parentPath: string) => void
  depth?: number
}

export function FileTreeNode({
  node,
  parentPath,
  selectedPath,
  onSelect,
  onFileClick,
  onContextMenu,
  depth = 0
}: FileTreeNodeProps) {
  const [isOpen, setIsOpen] = useState(depth < 1)
  const paddingLeft = depth * 12 + 8
  const isSelected = selectedPath === node.path

  const rowStyle: CSSProperties = {
    padding: `6px 10px 6px ${paddingLeft + 2}px`,
    cursor: 'pointer',
    color: node.isDirectory ? '#eee' : '#ccc',
    fontWeight: node.isDirectory ? 'bold' : 'normal',
    fontSize: '13px',
    backgroundColor: isSelected ? '#094771' : 'transparent'
  }

  if (!node.isDirectory) {
    return (
      <div
        style={rowStyle}
        onClick={() => {
          onSelect(node, parentPath)
          onFileClick(node.path, node.name)
        }}
        onContextMenu={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onSelect(node, parentPath)
          onContextMenu(event, node, parentPath)
        }}
        onMouseEnter={(e) => {
          if (!isSelected) e.currentTarget.style.backgroundColor = '#2a2d2e'
        }}
        onMouseLeave={(e) => {
          if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'
        }}
      >
        <i className="fa fa-file-o" style={{ marginRight: '6px' }} />
        {node.name}
      </div>
    )
  }

  return (
    <div>
      <div
        style={rowStyle}
        onClick={() => {
          onSelect(node, parentPath)
          setIsOpen((prev) => !prev)
        }}
        onContextMenu={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onSelect(node, parentPath)
          onContextMenu(event, node, parentPath)
        }}
        onMouseEnter={(e) => {
          if (!isSelected) e.currentTarget.style.backgroundColor = '#2a2d2e'
        }}
        onMouseLeave={(e) => {
          if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'
        }}
      >
        <i
          className={`fa ${isOpen ? 'fa-caret-down' : 'fa-caret-right'}`}
          style={{ width: '10px', marginRight: '6px' }}
        />
        <i
          className={`fa ${isOpen ? 'fa-folder-open' : 'fa-folder'}`}
          style={{ marginRight: '6px' }}
        />
        {node.name}
      </div>
      {isOpen &&
        node.children?.map((child) => (
          <FileTreeNode
            key={child.path}
            node={child}
            parentPath={node.path}
            selectedPath={selectedPath}
            onSelect={onSelect}
            onFileClick={onFileClick}
            onContextMenu={onContextMenu}
            depth={depth + 1}
          />
        ))}
    </div>
  )
}
