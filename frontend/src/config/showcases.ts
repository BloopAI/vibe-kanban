import { ShowcaseConfig } from '@/types/showcase';

export const showcases = {
  taskPanel: {
    id: 'task-panel-onboarding',
    stages: [
      {
        titleKey: 'showcases.taskPanel.companion.title',
        descriptionKey: 'showcases.taskPanel.companion.description',
        media: {
          type: 'video',
          src: 'https://vkcdn.britannio.dev/showcase/flat-task-panel/vk-onb-companion-demo-3.mp4',
        },
      },
      {
        titleKey: 'showcases.taskPanel.installation.title',
        descriptionKey: 'showcases.taskPanel.installation.description',
        media: {
          type: 'video',
          src: 'https://vkcdn.britannio.dev/showcase/flat-task-panel/vk-onb-install-companion-3.mp4',
        },
      },
      {
        titleKey: 'showcases.taskPanel.codeReview.title',
        descriptionKey: 'showcases.taskPanel.codeReview.description',
        media: {
          type: 'video',
          src: 'https://vkcdn.britannio.dev/showcase/flat-task-panel/vk-onb-code-review-3.mp4',
        },
      },
      {
        titleKey: 'showcases.taskPanel.pullRequest.title',
        descriptionKey: 'showcases.taskPanel.pullRequest.description',
        media: {
          type: 'video',
          src: 'https://vkcdn.britannio.dev/showcase/flat-task-panel/vk-onb-git-pr-3.mp4',
        },
      },
      {
        titleKey: 'showcases.taskPanel.tags.title',
        descriptionKey: 'showcases.taskPanel.tags.description',
        media: {
          type: 'video',
          src: 'https://vkcdn.britannio.dev/showcase/flat-task-panel/vk-tags.mp4',
        },
      },
    ],
  } satisfies ShowcaseConfig,
} as const;
