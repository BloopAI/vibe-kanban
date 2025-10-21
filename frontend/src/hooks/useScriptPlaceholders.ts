import { useUserSystem } from '@/components/config-provider';
import {
  createScriptPlaceholderStrategy,
  ScriptPlaceholderContext,
  type ScriptPlaceholders,
} from '@/utils/script-placeholders';

export function useScriptPlaceholders(): ScriptPlaceholders {
  const { system } = useUserSystem();

  if (system.environment) {
    return new ScriptPlaceholderContext(
      createScriptPlaceholderStrategy(system.environment.os_type)
    ).getPlaceholders();
  }

  return {
    setup: '#!/bin/bash\nnpm install\n# Add any setup commands here...',
    dev: '#!/bin/bash\nnpm run dev\n# Add dev server start command here...',
    cleanup:
      '#!/bin/bash\n# Add cleanup commands here...\n# This runs after coding agent execution',
  };
}
