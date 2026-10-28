import { createFileRoute } from '@tanstack/react-router';
import { LocalBoardPage } from '@web/pages/LocalBoardPage';

export const Route = createFileRoute('/_app/local-board')({
  component: LocalBoardPage,
});
