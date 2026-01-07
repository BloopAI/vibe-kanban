import * as React from 'react'

export type Editor = 'vscode' | 'vscode-insiders' | 'cursor' | (string & {})

export type PathModifier = (path: string) => string

declare function ClickToComponent(props: ClickToComponentProps): React.ReactElement

export type ClickToComponentProps = {
  editor?: Editor
  pathModifier?: PathModifier
}

export type Coords = [MouseEvent['pageX'], MouseEvent['pageY']]

export type Target = HTMLElement

export type ContextMenuProps = {
  onClose?: () => void
  pathModifier?: PathModifier
}
