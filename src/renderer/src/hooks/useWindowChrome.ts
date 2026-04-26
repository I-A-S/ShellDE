/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { useEffect, useState, type Dispatch, type MouseEvent, type SetStateAction } from 'react'

type AppMenuId = 'file' | 'edit' | 'selection' | 'view' | 'help'

type UseWindowChromeParams = {
  onOpenWorkspace: () => Promise<void>
  onCloseWorkspace: () => Promise<void>
  onOpenSearch: () => void
}

type UseWindowChromeResult = {
  isWindowMaximized: boolean
  isTopMenuExpanded: boolean
  setIsTopMenuExpanded: Dispatch<SetStateAction<boolean>>
  handleTopMenu: (menuId: AppMenuId, event: MouseEvent<HTMLButtonElement>) => void
  handleMinimize: () => void
  handleToggleMaximize: () => Promise<void>
  handleClose: () => void
}

export function useWindowChrome({
  onOpenWorkspace,
  onCloseWorkspace,
  onOpenSearch
}: UseWindowChromeParams): UseWindowChromeResult {
  const [isWindowMaximized, setIsWindowMaximized] = useState(false)
  const [isTopMenuExpanded, setIsTopMenuExpanded] = useState(false)

  useEffect(() => {
    window.api.isWindowMaximized().then(setIsWindowMaximized)
    const onResize = () => {
      window.api.isWindowMaximized().then(setIsWindowMaximized)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    window.api.onMenuOpenWorkspace(() => {
      void onOpenWorkspace()
    })
    window.api.onMenuCloseWorkspace(() => {
      void onCloseWorkspace()
    })
    window.api.onMenuOpenSearch(() => {
      onOpenSearch()
    })
  }, [onOpenWorkspace, onCloseWorkspace, onOpenSearch])

  const handleTopMenu = (menuId: AppMenuId, event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    window.api.showAppMenu(menuId, Math.round(rect.left), Math.round(rect.bottom))
  }

  const handleMinimize = () => {
    window.api.minimizeWindow()
  }

  const handleToggleMaximize = async () => {
    window.api.toggleMaximizeWindow()
    const maximized = await window.api.isWindowMaximized()
    setIsWindowMaximized(maximized)
  }

  const handleClose = () => {
    window.api.closeWindow()
  }

  return {
    isWindowMaximized,
    isTopMenuExpanded,
    setIsTopMenuExpanded,
    handleTopMenu,
    handleMinimize,
    handleToggleMaximize,
    handleClose
  }
}
