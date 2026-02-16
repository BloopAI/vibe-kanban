import { applyPatch, type Operation } from 'rfc6902';

export function applyUpsertPatch(target: object, ops: Operation[]): void {
  const errors = applyPatch(target, ops);
  // Retry failed replace ops as add (path didn't exist yet)
  const retries: Operation[] = [];
  for (let i = 0; i < errors.length; i++) {
    if (errors[i]?.name === 'MissingError' && ops[i].op === 'replace') {
      retries.push({ ...ops[i], op: 'add' as const });
    }
  }
  if (retries.length > 0) {
    applyPatch(target, retries);
  }
}
