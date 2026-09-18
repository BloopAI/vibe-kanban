import type { JsonValue } from 'shared/types';

export const TOOL_OUTPUT_DISPLAY_LIMIT = 2_000;
export const TOOL_OUTPUT_TRUNCATION_LIMIT = TOOL_OUTPUT_DISPLAY_LIMIT - 100;

const BINARY_SAMPLE_LIMIT = 50_000;
const STRUCTURED_SERIALIZATION_LIMIT = 50_000;
const STRUCTURED_DEPTH_LIMIT = 20;
const ESCAPE_CHARACTER = 0x1b;

type InspectionStatus = 'safe' | 'binary' | 'too_large';

interface InspectionState {
  size: number;
}

function formatCharacterCount(count: number): string {
  return count.toLocaleString('en-US');
}

function isBinaryLike(content: string): boolean {
  if (content.startsWith('%PDF-')) {
    return true;
  }

  const sample = content.slice(0, BINARY_SAMPLE_LIMIT);
  let controlCharacters = 0;

  for (let index = 0; index < sample.length; index += 1) {
    const code = sample.charCodeAt(index);

    if (code === 0) {
      return true;
    }

    const isControlCharacter =
      (code < 32 && code !== 9 && code !== 10 && code !== 13 && code !== 27) ||
      (code >= 127 && code <= 159);

    if (isControlCharacter) {
      controlCharacters += 1;
    }
  }

  return (
    controlCharacters >= 4 &&
    controlCharacters / Math.max(sample.length, 1) >= 0.1
  );
}

function incompleteAnsiSequenceStart(
  content: string,
  cutoff: number
): number | null {
  for (let index = 0; index < cutoff; index += 1) {
    if (content.charCodeAt(index) !== ESCAPE_CHARACTER) {
      continue;
    }

    const sequenceStart = index;
    index += 1;
    if (index >= cutoff) {
      return sequenceStart;
    }

    const sequenceType = content[index];
    if (sequenceType === '[') {
      index += 1;
      while (index < cutoff) {
        const code = content.charCodeAt(index);
        if (code >= 0x40 && code <= 0x7e) {
          break;
        }
        index += 1;
      }
      if (index >= cutoff) {
        return sequenceStart;
      }
    } else if (sequenceType === ']') {
      let complete = false;
      index += 1;
      while (index < cutoff) {
        const code = content.charCodeAt(index);
        if (code === 0x07) {
          complete = true;
          break;
        }
        if (
          code === ESCAPE_CHARACTER &&
          index + 1 < cutoff &&
          content[index + 1] === '\\'
        ) {
          index += 1;
          complete = true;
          break;
        }
        index += 1;
      }
      if (!complete) {
        return sequenceStart;
      }
    }
  }

  return null;
}

function safeTruncationIndex(content: string): number {
  let cutoff = TOOL_OUTPUT_TRUNCATION_LIMIT;
  const precedingCode = content.charCodeAt(cutoff - 1);
  const followingCode = content.charCodeAt(cutoff);

  if (
    precedingCode >= 0xd800 &&
    precedingCode <= 0xdbff &&
    followingCode >= 0xdc00 &&
    followingCode <= 0xdfff
  ) {
    cutoff -= 1;
  }

  return incompleteAnsiSequenceStart(content, cutoff) ?? cutoff;
}

function addSize(state: InspectionState, amount: number): boolean {
  state.size += amount;
  return state.size <= STRUCTURED_SERIALIZATION_LIMIT;
}

function escapedJsonStringLength(value: string, remaining: number): number {
  let length = 2;

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);

    if (
      code === 0x08 ||
      code === 0x09 ||
      code === 0x0a ||
      code === 0x0c ||
      code === 0x0d ||
      code === 0x22 ||
      code === 0x5c
    ) {
      length += 2;
    } else if (code < 0x20) {
      length += 6;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const nextCode = value.charCodeAt(index + 1);
      if (nextCode >= 0xdc00 && nextCode <= 0xdfff) {
        length += 2;
        index += 1;
      } else {
        length += 6;
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      length += 6;
    } else {
      length += 1;
    }

    if (length > remaining) {
      return remaining + 1;
    }
  }

  return length;
}

function inspectStructuredValue(
  value: JsonValue | undefined,
  depth: number,
  state: InspectionState
): InspectionStatus {
  if (depth > STRUCTURED_DEPTH_LIMIT) {
    return 'too_large';
  }

  if (typeof value === 'string') {
    if (isBinaryLike(value)) {
      return 'binary';
    }
    const remaining = STRUCTURED_SERIALIZATION_LIMIT - state.size;
    return addSize(state, escapedJsonStringLength(value, remaining))
      ? 'safe'
      : 'too_large';
  }

  if (value == null) {
    return addSize(state, 4) ? 'safe' : 'too_large';
  }

  if (typeof value === 'boolean') {
    return addSize(state, value ? 4 : 5) ? 'safe' : 'too_large';
  }

  if (typeof value === 'number') {
    return addSize(state, JSON.stringify(value)?.length ?? 4)
      ? 'safe'
      : 'too_large';
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return addSize(state, 2) ? 'safe' : 'too_large';
    }
    if (!addSize(state, 2)) {
      return 'too_large';
    }

    for (let index = 0; index < value.length; index += 1) {
      if (!addSize(state, (depth + 1) * 2)) {
        return 'too_large';
      }
      const status = inspectStructuredValue(value[index], depth + 1, state);
      if (status !== 'safe') {
        return status;
      }
      if (!addSize(state, 2)) {
        return 'too_large';
      }
    }

    return addSize(state, depth * 2 + 1) ? 'safe' : 'too_large';
  }

  if (!addSize(state, 1)) {
    return 'too_large';
  }
  let hasProperties = false;

  for (const key in value) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      continue;
    }
    const child = value[key];
    if (child === undefined) {
      continue;
    }

    if (!hasProperties) {
      hasProperties = true;
      if (!addSize(state, 1)) {
        return 'too_large';
      }
    }
    if (isBinaryLike(key)) {
      return 'binary';
    }
    if (!addSize(state, (depth + 1) * 2)) {
      return 'too_large';
    }
    const remaining = STRUCTURED_SERIALIZATION_LIMIT - state.size;
    if (!addSize(state, escapedJsonStringLength(key, remaining) + 2)) {
      return 'too_large';
    }
    const status = inspectStructuredValue(child, depth + 1, state);
    if (status !== 'safe') {
      return status;
    }
    if (!addSize(state, 2)) {
      return 'too_large';
    }
  }

  if (!hasProperties) {
    return addSize(state, 1) ? 'safe' : 'too_large';
  }
  return addSize(state, depth * 2 + 1) ? 'safe' : 'too_large';
}

export function prepareToolOutputForDisplay(content: string): string {
  if (isBinaryLike(content)) {
    return `[Binary tool output not displayed (${formatCharacterCount(content.length)} characters).]`;
  }

  if (content.length <= TOOL_OUTPUT_DISPLAY_LIMIT) {
    return content;
  }

  const cutoff = safeTruncationIndex(content);
  const omittedCharacters = content.length - cutoff;
  return `${content.slice(0, cutoff)}\n\n[Tool output truncated: ${formatCharacterCount(omittedCharacters)} characters omitted.]`;
}

export function prepareToolResultForDisplay(value: JsonValue): string {
  if (typeof value === 'string') {
    return prepareToolOutputForDisplay(value);
  }

  const status = inspectStructuredValue(value, 0, { size: 0 });
  if (status === 'binary') {
    return '[Binary tool output not displayed.]';
  }
  if (status === 'too_large') {
    return '[Structured tool output not displayed because it is too large.]';
  }

  return prepareToolOutputForDisplay(JSON.stringify(value, null, 2));
}

export function prepareSubagentResultForDisplay(
  value: JsonValue | undefined
): string | null {
  if (!value) {
    return null;
  }
  return prepareToolResultForDisplay(value);
}
