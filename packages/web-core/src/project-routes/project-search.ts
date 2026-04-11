import { zodValidator } from '@tanstack/zod-adapter';
import { z } from 'zod';

export const projectSearchSchema = z.object({});

export type ProjectSearch = z.infer<typeof projectSearchSchema>;

export const projectSearchValidator = zodValidator(projectSearchSchema);
