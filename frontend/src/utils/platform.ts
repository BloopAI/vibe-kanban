export function isMac(): boolean {
  return navigator.platform.toUpperCase().includes('MAC');
}

export function getModifierKey(): string {
  return isMac() ? '⌘' : 'Ctrl';
}

export function getModifierKeyLabel(): string {
  return isMac() ? 'Cmd' : 'Ctrl';
}
