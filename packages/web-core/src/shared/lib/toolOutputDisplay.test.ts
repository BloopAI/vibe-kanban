import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  TOOL_OUTPUT_DISPLAY_LIMIT,
  TOOL_OUTPUT_TRUNCATION_LIMIT,
  prepareSubagentResultForDisplay,
  prepareToolOutputForDisplay,
  prepareToolResultForDisplay,
} from './toolOutputDisplay.ts';

describe('prepareToolOutputForDisplay', () => {
  it('preserves ordinary text output', () => {
    const content = 'first line\nsecond line\twith a tab';

    assert.equal(prepareToolOutputForDisplay(content), content);
  });

  it('omits binary-like output without exposing its bytes', () => {
    const content = `%PDF-1.7\n${'printable-pdf-stream'.repeat(100)}`;
    const result = prepareToolOutputForDisplay(content);

    assert.match(result, /binary tool output.+not displayed/i);
    assert.doesNotMatch(result, /%PDF|printable-pdf-stream/);
  });

  it('detects binary data after a text header', () => {
    const content = `${'metadata\n'.repeat(1_000)}${'binary\0\x01'.repeat(5_000)}`;
    const result = prepareToolOutputForDisplay(content);

    assert.match(result, /binary tool output.+not displayed/i);
    assert.doesNotMatch(result, /metadata|payload/);
  });

  it('does not split a surrogate pair at the display limit', () => {
    const content = `${'a'.repeat(TOOL_OUTPUT_TRUNCATION_LIMIT - 1)}😀${'b'.repeat(200)}`;
    const result = prepareToolOutputForDisplay(content);
    const displayed = result.slice(0, result.indexOf('\n\n['));

    assert.equal(displayed, 'a'.repeat(TOOL_OUTPUT_TRUNCATION_LIMIT - 1));
    assert.notEqual(displayed.charCodeAt(displayed.length - 1), 0xd83d);
  });

  it('does not split an ANSI sequence at the display limit', () => {
    const content = `${'a'.repeat(TOOL_OUTPUT_TRUNCATION_LIMIT - 4)}\x1b[31m${'r'.repeat(200)}`;
    const result = prepareToolOutputForDisplay(content);
    const displayed = result.slice(0, result.indexOf('\n\n['));

    assert.equal(displayed, 'a'.repeat(TOOL_OUTPUT_TRUNCATION_LIMIT - 4));
    assert.doesNotMatch(displayed, /\x1b/);
  });

  it('does not split an ANSI OSC sequence at the display limit', () => {
    const content = `${'a'.repeat(TOOL_OUTPUT_TRUNCATION_LIMIT - 10)}\x1b]8;;https://example.com\x07${'r'.repeat(200)}`;
    const result = prepareToolOutputForDisplay(content);
    const displayed = result.slice(0, result.indexOf('\n\n['));

    assert.equal(displayed, 'a'.repeat(TOOL_OUTPUT_TRUNCATION_LIMIT - 10));
    assert.doesNotMatch(displayed, /\x1b/);
  });

  it('preserves complete ANSI OSC terminators before the display limit', () => {
    for (const terminator of ['\x07', '\x1b\\']) {
      const sequence = `\x1b]0;title${terminator}`;
      const content = `prefix${sequence}${'a'.repeat(TOOL_OUTPUT_DISPLAY_LIMIT)}`;
      const result = prepareToolOutputForDisplay(content);
      const displayed = result.slice(0, result.indexOf('\n\n['));

      assert.match(displayed, /\x1b]0;title/);
      assert.ok(displayed.length <= TOOL_OUTPUT_TRUNCATION_LIMIT);
    }
  });

  it('bounds large text output and explains the omission', () => {
    const content = 'a'.repeat(TOOL_OUTPUT_TRUNCATION_LIMIT + 10_000);
    const result = prepareToolOutputForDisplay(content);

    assert.ok(result.length < content.length);
    assert.ok(result.length <= TOOL_OUTPUT_DISPLAY_LIMIT);
    assert.match(result, /10,000 characters? omitted/i);
    assert.equal(
      result.slice(0, TOOL_OUTPUT_TRUNCATION_LIMIT),
      'a'.repeat(TOOL_OUTPUT_TRUNCATION_LIMIT)
    );
    assert.equal(prepareToolOutputForDisplay(result), result);
  });

  it('preserves text at the display limit', () => {
    const content = 'a'.repeat(TOOL_OUTPUT_DISPLAY_LIMIT);

    assert.equal(prepareToolOutputForDisplay(content), content);
  });

  it('preserves ordinary structured output as pretty JSON', () => {
    const value = { message: 'hello', count: 2, enabled: true };

    assert.equal(
      prepareToolResultForDisplay(value),
      JSON.stringify(value, null, 2)
    );
  });

  it('preflights a large ordinary ASCII JSON string before truncating it', () => {
    const result = prepareToolResultForDisplay({ value: 'a'.repeat(10_000) });

    assert.match(result, /^\{\n  "value": "a+/);
    assert.match(result, /Tool output truncated/);
    assert.doesNotMatch(result, /structured tool output not displayed/i);
  });

  it('omits structured output with an oversized key', () => {
    const result = prepareToolResultForDisplay({ ['k'.repeat(60_000)]: true });

    assert.match(result, /structured tool output.+not displayed/i);
    assert.doesNotMatch(result, /kkkkkkkk/);
  });

  it('omits structured output whose escaping exceeds the serialization budget', () => {
    const result = prepareToolResultForDisplay({ value: '"'.repeat(30_000) });

    assert.match(result, /structured tool output.+not displayed/i);
  });

  it('omits excessively wide and deep structured output', () => {
    const wide = Array.from({ length: 10_000 }, () => null);
    let deep: unknown = 'value';
    for (let depth = 0; depth < 21; depth += 1) {
      deep = [deep];
    }

    assert.match(
      prepareToolResultForDisplay(wide),
      /structured tool output.+not displayed/i
    );
    assert.match(
      prepareToolResultForDisplay(deep as never),
      /structured tool output.+not displayed/i
    );
  });

  it('preserves generic falsy scalars and hides subagent falsy results', () => {
    assert.equal(prepareToolResultForDisplay(false), 'false');
    assert.equal(prepareToolResultForDisplay(0), '0');
    assert.equal(prepareSubagentResultForDisplay(false), null);
    assert.equal(prepareSubagentResultForDisplay(0), null);
    assert.equal(prepareSubagentResultForDisplay(null), null);
    assert.equal(prepareSubagentResultForDisplay(''), null);
  });
});
