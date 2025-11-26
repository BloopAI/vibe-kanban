import { createCollection } from '@tanstack/react-db';
import { electricCollectionOptions } from '@tanstack/electric-db-collection';
import type { SharedTask } from 'shared/types';

import { electricShapeHeaders, electricShapeUrl } from './config';

export const sharedTasksCollection = createCollection(
  electricCollectionOptions<SharedTask>({
    id: 'shared_tasks',
    getKey: (task) => task.id,
    shapeOptions: {
      url: electricShapeUrl,
      params: {
        table: 'shared_tasks',
      },
      ...(electricShapeHeaders ? { headers: electricShapeHeaders } : {}),
      parser: {
        timestamptz: (value: string) => value,
      },
    },
  })
);
