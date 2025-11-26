import { createCollection } from '@tanstack/react-db';
import { electricCollectionOptions } from '@tanstack/electric-db-collection';
import type { SharedTask } from 'shared/types';

import { oauthApi } from '../api';
import { getElectricShapeUrl } from './config';

export const sharedTasksCollection = createCollection(
  electricCollectionOptions<SharedTask>({
    id: 'shared_tasks',
    getKey: (task) => task.id,
    shapeOptions: {
      url: getElectricShapeUrl('shared_tasks'),
      headers: {
        // Async function - called when needed, always gets fresh token
        Authorization: async () => {
          const tokenResponse = await oauthApi.getToken();
          return tokenResponse ? `Bearer ${tokenResponse.access_token}` : '';
        },
      },
      parser: {
        timestamptz: (value: string) => value,
      },
    },
  })
);
