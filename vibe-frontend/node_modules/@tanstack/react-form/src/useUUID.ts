import { useState } from 'react'
import { uuid } from '@tanstack/form-core'

/** Generates a random UUID. and returns a stable reference to it. */
export function useUUID() {
  return useState<string>(() => uuid())[0]
}
