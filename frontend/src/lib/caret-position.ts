const CARET_PROBE_CHARACTER = '\u200b';

const mirrorStyleProperties = [
  'boxSizing',
  'fontFamily',
  'fontSize',
  'fontStyle',
  'fontWeight',
  'letterSpacing',
  'lineHeight',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'textAlign',
  'textTransform',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderTopStyle',
  'borderRightStyle',
  'borderBottomStyle',
  'borderLeftStyle',
] as const;

type MirrorStyleProperty = (typeof mirrorStyleProperties)[number];

export const getCaretClientRect = (
  textarea: HTMLTextAreaElement,
  targetIndex?: number
) => {
  if (typeof window === 'undefined') return null;

  const selectionIndex =
    typeof targetIndex === 'number'
      ? Math.min(Math.max(targetIndex, 0), textarea.value.length)
      : (textarea.selectionEnd ?? textarea.value.length);

  const textBeforeCaret = textarea.value.slice(0, selectionIndex);
  const textareaRect = textarea.getBoundingClientRect();
  const computedStyle = window.getComputedStyle(textarea);

  const mirror = document.createElement('div');
  mirror.setAttribute('data-caret-mirror', 'true');
  mirror.style.position = 'absolute';
  mirror.style.top = `${textareaRect.top + window.scrollY}px`;
  mirror.style.left = `${textareaRect.left + window.scrollX}px`;
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordBreak = 'break-word';
  mirror.style.overflow = 'hidden';
  mirror.style.width = `${textareaRect.width}px`;

  mirrorStyleProperties.forEach((property: MirrorStyleProperty) => {
    const value = computedStyle[property];
    if (value) {
      mirror.style[property] = value;
    }
  });

  mirror.textContent = textBeforeCaret;

  const probe = document.createElement('span');
  probe.textContent = CARET_PROBE_CHARACTER;
  mirror.appendChild(probe);

  document.body.appendChild(mirror);
  const caretRect = probe.getBoundingClientRect();
  document.body.removeChild(mirror);

  return caretRect;
};
