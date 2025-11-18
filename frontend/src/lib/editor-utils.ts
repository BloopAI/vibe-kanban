import { EditorType } from 'shared/types';

export const EDITOR_INSTALL_URLS: Partial<Record<EditorType, string>> = {
  [EditorType.VS_CODE]: 'https://code.visualstudio.com/',
  [EditorType.CURSOR]: 'https://cursor.sh/',
  [EditorType.WINDSURF]: 'https://codeium.com/windsurf',
  [EditorType.INTELLI_J]: 'https://www.jetbrains.com/idea/download/',
  [EditorType.ZED]: 'https://zed.dev/',
  [EditorType.XCODE]: 'https://developer.apple.com/xcode/',
};

export function getEditorInstallUrl(
  editorType: EditorType
): string | undefined {
  return EDITOR_INSTALL_URLS[editorType];
}
