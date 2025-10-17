import { ShowcaseConfig } from '@/types/showcase';

export const taskPanelShowcase: ShowcaseConfig = {
  id: 'task-panel-onboarding',
  version: 1,
  stages: [
    {
      titleKey: 'showcases.taskPanel.companion.title',
      descriptionKey: 'showcases.taskPanel.companion.description',
      media: {
        type: 'video',
        src: 'https://vkcdn.britannio.dev/showcase/flat-task-panel/vk-onb-companion-demo.mp4',
      },
    },
    {
      titleKey: 'showcases.taskPanel.installation.title',
      descriptionKey: 'showcases.taskPanel.installation.description',
      media: {
        type: 'video',
        src: 'https://vkcdn.britannio.dev/showcase/flat-task-panel/vk-onb-install-companion.mp4',
      },
    },
    {
      titleKey: 'showcases.taskPanel.codeReview.title',
      descriptionKey: 'showcases.taskPanel.codeReview.description',
      media: {
        type: 'video',
        src: 'https://vkcdn.britannio.dev/showcase/flat-task-panel/vk-onb-code-review.mp4',
      },
    },
    {
      titleKey: 'showcases.taskPanel.pullRequest.title',
      descriptionKey: 'showcases.taskPanel.pullRequest.description',
      media: {
        type: 'video',
        src: 'https://vkcdn.britannio.dev/showcase/flat-task-panel/vk-onb-git-pr.mp4',
      },
    },
  ],
};

export const showcases = {
  taskPanel: taskPanelShowcase,
};
