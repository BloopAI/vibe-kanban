export * from '../../shared/types';

export interface MobileProject {
  id: string;
  name: string;
  taskCount: number;
  completedTasks: number;
  lastActivity: string;
}

export interface MobileTask {
  id: string;
  title: string;
  description?: string;
  status: 'todo' | 'inprogress' | 'inreview' | 'done' | 'cancelled';
  projectName: string;
  createdAt: string;
}