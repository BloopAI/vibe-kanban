import { X, Maximize2, Minimize2 } from 'lucide-react';
import { Link, useMatch } from 'react-router-dom';
import { Button } from '../ui/button';

interface AttemptHeaderActionsProps {
  onClose: () => void;
}

export const AttemptHeaderActions = ({
  onClose,
}: AttemptHeaderActionsProps) => {
  const inFsAttempt = useMatch(
    '/projects/:projectId/tasks/:taskId/attempts/:attemptId/full/*'
  );
  const inAttempt = useMatch(
    '/projects/:projectId/tasks/:taskId/attempts/:attemptId'
  );

  const isFullscreen = Boolean(inFsAttempt);

  const fullscreenTarget = inAttempt
    ? `/projects/${inAttempt.params.projectId}/tasks/${inAttempt.params.taskId}/attempts/${inAttempt.params.attemptId}/full/preview`
    : undefined;

  const exitFullscreenTarget = inFsAttempt
    ? `/projects/${inFsAttempt.params.projectId}/tasks/${inFsAttempt.params.taskId}/attempts/${inFsAttempt.params.attemptId}`
    : undefined;

  const to = isFullscreen
    ? (exitFullscreenTarget ?? '..')
    : (fullscreenTarget ?? 'full/preview');

  return (
    <>
      <Button
        variant="icon"
        aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        aria-pressed={isFullscreen}
        asChild
      >
        <Link to={to}>
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </Link>
      </Button>
      <Button variant="icon" aria-label="Close" onClick={onClose}>
        <X size={16} />
      </Button>
    </>
  );
};
