import { describe, it, expect } from 'vitest';
import type {
  ExecutorConfig,
  ModelInfo,
  ModelSelectorConfig,
} from 'shared/types';
import { PermissionPolicy } from 'shared/types';
import {
  appendPresetModel,
  dropUnavailableModel,
  resolvePermissionPolicy,
  staleSelections,
} from './modelSelector';

const { AUTO, SUPERVISED, PLAN } = PermissionPolicy;

function model(id: string): ModelInfo {
  return { id, name: id, provider_id: null, reasoning_options: [] };
}

const models = [model('auto'), model('claude-sonnet-5.5')];

function config(): ModelSelectorConfig {
  return {
    providers: [],
    models,
    default_model: null,
    agents: [],
    permissions: [AUTO, SUPERVISED, PLAN],
  };
}

describe('resolvePermissionPolicy', () => {
  it('shows Ask when a live list has no Plan', () => {
    expect(resolvePermissionPolicy([AUTO, SUPERVISED], PLAN, true)).toBe(
      SUPERVISED
    );
  });

  it('keeps Plan while the list may be stale', () => {
    expect(resolvePermissionPolicy([AUTO, SUPERVISED], PLAN, false)).toBe(PLAN);
  });

  it('uses the first option without Ask, never Auto', () => {
    expect(resolvePermissionPolicy([AUTO, PLAN], SUPERVISED, true)).toBe(PLAN);
    expect(resolvePermissionPolicy([AUTO], PLAN, true)).toBeNull();
  });

  it('keeps an offered permission and defaults to the first', () => {
    expect(resolvePermissionPolicy([AUTO, SUPERVISED], AUTO, true)).toBe(AUTO);
    expect(resolvePermissionPolicy([SUPERVISED, AUTO], null, true)).toBe(
      SUPERVISED
    );
    expect(resolvePermissionPolicy([], PLAN, true)).toBeNull();
  });
});

describe('dropUnavailableModel', () => {
  it('drops a model missing from a live list', () => {
    expect(dropUnavailableModel(models, null, 'gpt-4.1', true)).toBeNull();
  });

  it('keeps it while the list may be stale', () => {
    expect(dropUnavailableModel(models, null, 'gpt-4.1', false)).toBe(
      'gpt-4.1'
    );
  });

  it('keeps an available model, matching case-insensitively', () => {
    expect(dropUnavailableModel(models, null, 'Claude-Sonnet-5.5', true)).toBe(
      'Claude-Sonnet-5.5'
    );
  });
});

describe('appendPresetModel', () => {
  it('adds a missing preset model only while the list may be stale', () => {
    expect(appendPresetModel(config(), 'gpt-4.1')?.models[0].id).toBe(
      'gpt-4.1'
    );
    expect(appendPresetModel(config(), 'gpt-4.1', true)?.models).toEqual(
      models
    );
  });
});

describe('staleSelections', () => {
  const live: ModelSelectorConfig = {
    ...config(),
    permissions: [AUTO, SUPERVISED],
  };
  const selected = (fields: Partial<ExecutorConfig>): ExecutorConfig => ({
    executor: 'COPILOT',
    ...fields,
  });

  it('resets a last-used model and Plan the live list dropped', () => {
    expect(
      staleSelections(
        live,
        selected({ model_id: 'gpt-4.1', permission_policy: PLAN }),
        null,
        true
      )
    ).toEqual({ model_id: null, permission_policy: SUPERVISED });
  });

  it('keeps profile values, so the run still warns', () => {
    const preset = selected({ model_id: 'gpt-4.1', permission_policy: PLAN });
    expect(staleSelections(live, preset, preset, true)).toEqual({});
  });

  it('changes nothing while the list may be stale or still offers them', () => {
    expect(
      staleSelections(live, selected({ model_id: 'gpt-4.1' }), null, false)
    ).toEqual({});
    expect(
      staleSelections(
        live,
        selected({ model_id: 'auto', permission_policy: AUTO }),
        null,
        true
      )
    ).toEqual({});
  });
});
