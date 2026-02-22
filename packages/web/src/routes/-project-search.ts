import { z } from 'zod';
import { zodValidator } from '@tanstack/zod-adapter';

export const projectSearchSchema = z.object({
  statusId: z.string().optional(),
  priority: z.string().optional(),
  assignees: z.string().optional(),
  parentIssueId: z.string().optional(),
  mode: z.string().optional(),
  orgId: z.string().optional(),
});

export const projectSearchValidator = zodValidator(projectSearchSchema);
