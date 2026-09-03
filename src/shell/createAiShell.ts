export type WorkspaceId = 'home' | 'spatial'

export type AiShellHandle = {
  setWorkspace: (id: WorkspaceId) => void
  getWorkspace: () => WorkspaceId
  dispose: () => void
}

export type AiShellOptions = {
  root: HTMLElement
  onWorkspaceChange?: (id: WorkspaceId) => void
}

export function createAiShell(options: AiShellOptions): AiShellHandle {
  const { root } = options
  let workspace: WorkspaceId =
    (root.dataset.workspace as WorkspaceId | undefined) ?? 'home'

  const navButtons = Array.from(
    root.querySelectorAll<HTMLButtonElement>('[data-workspace-target]'),
  )
  const panels = Array.from(
    root.querySelectorAll<HTMLElement>('[data-workspace-panel]'),
  )

  const applyWorkspace = (id: WorkspaceId) => {
    workspace = id
    root.dataset.workspace = id

    for (const button of navButtons) {
      const target = button.dataset.workspaceTarget as WorkspaceId | undefined
      const active = target === id
      button.dataset.active = active ? 'true' : 'false'
      button.setAttribute('aria-pressed', active ? 'true' : 'false')
    }

    for (const panel of panels) {
      const panelId = panel.dataset.workspacePanel as WorkspaceId | undefined
      const active = panelId === id
      panel.hidden = !active
      panel.dataset.active = active ? 'true' : 'false'
    }

    options.onWorkspaceChange?.(id)
  }

  const onNavClick = (event: Event) => {
    const button = event.currentTarget as HTMLButtonElement
    const target = button.dataset.workspaceTarget as WorkspaceId | undefined
    if (!target || target === workspace) {
      return
    }
    applyWorkspace(target)
  }

  for (const button of navButtons) {
    button.addEventListener('click', onNavClick)
  }

  applyWorkspace(workspace)

  return {
    setWorkspace: applyWorkspace,
    getWorkspace: () => workspace,
    dispose: () => {
      for (const button of navButtons) {
        button.removeEventListener('click', onNavClick)
      }
    },
  }
}
