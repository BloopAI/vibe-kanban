export { VibeKanbanWebCompanion } from './VibeKanbanWebCompanion'

export type Editor = 'vscode' | 'vscode-insiders' | 'cursor' | string

export type PathModifier = (path: string) => string

export type VibeKanbanWebCompanionProps = {
  editor?: Editor
  pathModifier?: PathModifier
}

export type Coords = [MouseEvent['pageX'], MouseEvent['pageY']]

export type Target = HTMLElement


