import { VibeKanbanWebCompanion as Component } from './VibeKanbanWebCompanion.js'

export const VibeKanbanWebCompanion =
  process.env.NODE_ENV === 'development' ? Component : () => null
