import { useEffect, useState } from 'react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { tasksApi } from '@/lib/api';
import type { SharedTaskRecord } from '@/hooks/useProjectTasks';
import { useAuth } from '@/hooks';
import { useMutation } from '@tanstack/react-query';
import { useProject } from '@/contexts/project-context';
import { useProjectRemoteMembers } from '@/hooks/useProjectRemoteMembers';
import type { OrganizationMemberWithProfile } from 'shared/types';

export interface ReassignDialogProps {
  sharedTask: SharedTaskRecord;
}

const buildMemberLabel = (member: OrganizationMemberWithProfile): string => {
  const fullName = [member.first_name, member.last_name]
    .filter(Boolean)
    .join(' ');
  if (fullName) {
    return fullName;
  }
  if (member.username) {
    return `@${member.username}`;
  }
  return member.user_id;
};

const ReassignDialogImpl = NiceModal.create<ReassignDialogProps>(
  ({ sharedTask }) => {
    const modal = useModal();
    const { userId } = useAuth();

    const [selection, setSelection] = useState<string | undefined>(
      sharedTask.assignee_user_id ?? undefined
    );
    const [submitError, setSubmitError] = useState<string | null>(null);

    const isCurrentAssignee = sharedTask.assignee_user_id === userId;

    const { projectId } = useProject();
    const membersQuery = useProjectRemoteMembers(projectId);

    useEffect(() => {
      if (!modal.visible) {
        return;
      }
      setSelection(sharedTask.assignee_user_id ?? undefined);
      setSubmitError(null);
    }, [modal.visible, sharedTask.assignee_user_id]);

    const handleClose = () => {
      modal.resolve(null);
      modal.hide();
    };

    const getStatus = (err: unknown) =>
      err && typeof err === 'object' && 'status' in err
        ? (err as { status?: number }).status
        : undefined;

    const getReadableError = (err: unknown) => {
      const status = getStatus(err);
      if (status === 401 || status === 403) {
        return 'Only the current assignee can reassign this task.';
      }
      if (status === 409) {
        return 'The task assignment changed. Refresh and try again.';
      }
      return 'Failed to reassign. Try again.';
    };

    const reassignMutation = useMutation({
      mutationKey: ['tasks', 'reassign', sharedTask.id],
      mutationFn: async (newAssignee: string) =>
        tasksApi.reassign(sharedTask.id, {
          new_assignee_user_id: newAssignee,
          version: sharedTask.version,
        }),
      onSuccess: (result) => {
        modal.resolve(result.shared_task);
        modal.hide();
      },
      onError: (error) => {
        setSubmitError(getReadableError(error));
      },
    });

    const handleConfirm = async () => {
      if (reassignMutation.isPending) {
        return;
      }

      if (!selection) {
        setSubmitError('Select an assignee before reassigning.');
        return;
      }

      setSubmitError(null);
      try {
        await reassignMutation.mutateAsync(selection);
      } catch {
        // errors handled in onError
      }
    };

    const membersError = (() => {
      if (!projectId) {
        return 'Unable to determine project context.';
      }
      if (membersQuery.isError) {
        return (
          membersQuery.error.message || 'Failed to load organization members.'
        );
      }
      return null;
    })();

    const memberOptions = membersQuery.data?.members ?? [];

    const canSubmit =
      isCurrentAssignee &&
      !reassignMutation.isPending &&
      !membersQuery.isPending &&
      !membersQuery.isError &&
      !membersError &&
      selection !== undefined &&
      selection !== (sharedTask.assignee_user_id ?? undefined);

    return (
      <Dialog
        open={modal.visible}
        onOpenChange={(open) => {
          if (open) {
            setSelection(sharedTask.assignee_user_id ?? undefined);
            setSubmitError(null);
            reassignMutation.reset();
          } else {
            handleClose();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reassign</DialogTitle>
            <DialogDescription>
              Reassign this task to another organization member.{' '}
            </DialogDescription>
          </DialogHeader>

          {!isCurrentAssignee && (
            <Alert variant="destructive">
              You must be the current assignee to reassign this task.
            </Alert>
          )}

          {membersError && <Alert variant="destructive">{membersError}</Alert>}

          <div className="space-y-3">
            <Select
              disabled={
                !isCurrentAssignee ||
                membersQuery.isPending ||
                Boolean(membersError)
              }
              value={selection}
              onValueChange={(value) => {
                setSelection(value);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue
                  placeholder={
                    membersQuery.isPending
                      ? 'Loading members...'
                      : 'Select an assignee'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {memberOptions.map((member) => (
                  <SelectItem key={member.user_id} value={member.user_id}>
                    {member.user_id === userId
                      ? `${buildMemberLabel(member)} (you)`
                      : buildMemberLabel(member)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {membersQuery.isPending && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading members...
              </div>
            )}
          </div>

          {submitError && <Alert variant="destructive">{submitError}</Alert>}

          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={reassignMutation.isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={!canSubmit}>
              {reassignMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Reassigning...
                </span>
              ) : (
                'Reassign'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

export const ReassignDialog = defineModal<
  ReassignDialogProps,
  SharedTaskRecord | null
>(ReassignDialogImpl);
