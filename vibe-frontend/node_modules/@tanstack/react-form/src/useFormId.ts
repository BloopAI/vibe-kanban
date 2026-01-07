import * as React from 'react'
import { useUUID } from './useUUID'

/** React 17 does not have the useId hook, so we use a random uuid as a fallback. */
export const useFormId =
  React.version.split('.')[0] === '17' ? useUUID : React.useId
