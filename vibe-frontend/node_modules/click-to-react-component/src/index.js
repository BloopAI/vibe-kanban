import { ClickToComponent as Component } from './ClickToComponent.js'

export const ClickToComponent =
  process.env.NODE_ENV === 'development' ? Component : () => null
