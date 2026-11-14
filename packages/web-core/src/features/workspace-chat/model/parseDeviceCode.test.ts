import { describe, it, expect } from 'vitest';
import { parseDeviceCode } from './parseDeviceCode';

describe('parseDeviceCode', () => {
  it('reads the Copilot device-flow prompt', () => {
    const output = [
      'To authenticate, visit https://github.com/login/device and enter code DF36-CD28',
      'Waiting for authorization...',
    ].join('\n');
    expect(parseDeviceCode(output)).toEqual({
      url: 'https://github.com/login/device',
      code: 'DF36-CD28',
    });
  });

  it('drops punctuation after the link', () => {
    expect(
      parseDeviceCode('Open https://example.com/device. Code: ABCD-12345')
    ).toEqual({ url: 'https://example.com/device', code: 'ABCD-12345' });
  });

  it('needs both a link and a code on the same line', () => {
    expect(parseDeviceCode('Waiting for authorization...')).toBeNull();
    expect(parseDeviceCode('Visit https://github.com/login/device')).toBeNull();
    expect(parseDeviceCode('Installing Cursor CLI... ABCD-1234')).toBeNull();
  });

  it('ignores code-like text inside the link', () => {
    expect(
      parseDeviceCode('See https://example.com/ABCD-1234/docs for help')
    ).toBeNull();
  });
});
