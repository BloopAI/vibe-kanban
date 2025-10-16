import {
  COMPANION_INSTALL_TASK_TITLE,
  COMPANION_INSTALL_TASK_DESCRIPTION,
} from './companion-install-task';

export interface DefaultTask {
  id: string;
  descriptionKey: string;
  // Title and description remain in English (technical content)
  title: string;
  description: string;
}

export const DEFAULT_TASKS: DefaultTask[] = [
  {
    id: 'companion-install',
    descriptionKey: 'setup.defaultTasks.companionInstall.description',
    // Title and description stay in English - they're technical and will be created as tasks
    title: COMPANION_INSTALL_TASK_TITLE,
    description: COMPANION_INSTALL_TASK_DESCRIPTION,
  },
  // Future tasks can be added here:
  // {
  //   id: 'setup-tests',
  //   descriptionKey: 'setup.defaultTasks.setupTests.description',
  //   title: 'Set up testing framework',
  //   description: '...',
  // },
];
