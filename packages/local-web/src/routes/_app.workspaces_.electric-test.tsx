import { createFileRoute } from '@tanstack/react-router';
import { ElectricTestPage } from '@/pages/workspaces/ElectricTestPage';

export const Route = createFileRoute('/_app/workspaces_/electric-test')({
  component: ElectricTestPage,
});
