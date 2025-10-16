import { ShowcaseConfig } from '@/types/showcase';

export const taskPanelShowcase: ShowcaseConfig = {
  id: 'task-panel-onboarding',
  version: '1.0.0',
  stages: [
    {
      titleKey: 'showcases.taskPanel.sendFollowups.title',
      descriptionKey: 'showcases.taskPanel.sendFollowups.description',
      media: {
        type: 'video',
        src: 'https://vkcdn.britannio.dev/vk-parallel-tasks-2.mp4',
      },
    },
    {
      titleKey: 'showcases.taskPanel.codeReview.title',
      descriptionKey: 'showcases.taskPanel.codeReview.description',
      media: {
        type: 'video',
        src: 'https://vkcdn.britannio.dev/vk-parallel-tasks-2.mp4',
      },
    },
    {
      titleKey: 'showcases.taskPanel.gitActions.title',
      descriptionKey: 'showcases.taskPanel.gitActions.description',
      media: {
        type: 'video',
        src: 'https://vkcdn.britannio.dev/vk-parallel-tasks-2.mp4',
      },
    },
    {
      titleKey: 'showcases.taskPanel.livePreviews.title',
      descriptionKey: 'showcases.taskPanel.livePreviews.description',
      media: {
        type: 'video',
        src: 'https://vkcdn.britannio.dev/vk-parallel-tasks-2.mp4',
      },
    },
    {
      titleKey: 'showcases.taskPanel.vkCompanion.title',
      descriptionKey: 'showcases.taskPanel.vkCompanion.description',
      media: {
        type: 'video',
        src: 'https://vkcdn.britannio.dev/vk-parallel-tasks-2.mp4',
      },
    },
  ],
};

export const showcases = {
  taskPanel: taskPanelShowcase,
};
