import { isUndefined } from '@/utils'
import { StackFrame } from '../types'

export const UNKNOWN_FUNCTION = '?'

export function createFrame(
  platform: StackFrame['platform'],
  filename: string,
  func: string,
  lineno?: number,
  colno?: number
): StackFrame {
  const frame: StackFrame = {
    // TODO: should be a variable here
    platform,
    filename,
    function: func === '<anonymous>' ? UNKNOWN_FUNCTION : func,
    in_app: true, // All browser frames are considered in_app
  }

  if (!isUndefined(lineno)) {
    frame.lineno = lineno
  }

  if (!isUndefined(colno)) {
    frame.colno = colno
  }

  return frame
}
