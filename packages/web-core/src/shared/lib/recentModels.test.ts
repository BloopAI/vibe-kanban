import { describe, it, expect } from 'vitest';
import type { ModelInfo } from 'shared/types';
import { getRecentReasoning } from './recentModels';

function model(id: string, reasoning: string[]): ModelInfo {
  return {
    id,
    name: id,
    provider_id: null,
    reasoning_options: reasoning.map((r) => ({
      id: r,
      label: r,
      is_default: r === 'medium',
    })),
  };
}

describe('getRecentReasoning', () => {
  const haiku = model('claude-haiku-5.5', ['low', 'medium', 'high']);

  it('returns the reasoning last picked for the model', () => {
    expect(getRecentReasoning({ 'Claude-Haiku-5.5': 'high' }, haiku)).toBe(
      'high'
    );
  });

  it('ignores one the model no longer offers, or another model', () => {
    expect(getRecentReasoning({ 'claude-haiku-5.5': 'max' }, haiku)).toBeNull();
    expect(getRecentReasoning({ 'gpt-5.4': 'high' }, haiku)).toBeNull();
  });
});
