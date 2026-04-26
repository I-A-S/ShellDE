import type { Tab } from '../types'

export function getLanguage(fileName: string): string {
  if (fileName.endsWith('.v') || fileName.endsWith('.sv')) return 'verilog'
  if (fileName.endsWith('.vhd') || fileName.endsWith('.vhdl')) return 'vhdl'
  if (fileName.endsWith('.py')) return 'python'
  if (fileName.endsWith('.json')) return 'json'
  return 'plaintext'
}

export function resolveActiveTabPath(tabs: Tab[], activeTabPath: string | null): string | null {
  if (activeTabPath && tabs.some((tab) => tab.path === activeTabPath)) {
    return activeTabPath
  }
  return tabs.length > 0 ? tabs[tabs.length - 1].path : null
}
