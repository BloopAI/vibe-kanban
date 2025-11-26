import { createCollection } from '@tanstack/react-db';
import { electricCollectionOptions } from '@tanstack/electric-db-collection';
import type { SharedTask } from 'shared/types';

import { createAuthenticatedShapeOptions } from './config';

export const sharedTasksCollection = createCollection(
  electricCollectionOptions<SharedTask>({
    id: 'shared_tasks',
    getKey: (task) => task.id,
    shapeOptions: createAuthenticatedShapeOptions('shared_tasks'),
  })
);
