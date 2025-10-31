import { useEffect, useState } from 'react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
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
import { useOrganization, useAuth } from '@clerk/clerk-react';
import type { OrganizationMembershipResource } from '@clerk/types';
import { useMutation, useQuery } from '@tanstack/react-query';

export interface ReassignDialogProps {
  sharedTask: SharedTaskRecord;
}

type MemberOption = {
  userId: string;
  label: string;
};

const buildMemberLabel = (
  membership: OrganizationMembershipResource
): string => {
  const data = membership.publicUserData;
  if (!data) {
    return 'Member';
  }

  const combinedName = [data.firstName, data.lastName]
    .filter((part): part is string => Boolean(part && part.trim().length > 0))
    .join(' ')
    .trim();
  if (combinedName.length > 0) {
    return combinedName;
  }

  if (data.identifier && data.identifier.trim().length > 0) {
    return data.identifier;
  }

  if (data.userId && data.userId.trim().length > 0) {
    return data.userId;
  }

  return 'Member';
};

export const ReassignDialog = NiceModal.create<ReassignDialogProps>(
  ({ sharedTask }) => {
    const modal = useModal();
    const { organization } = useOrganization();
    const { userId } = useAuth();

    const [selection, setSelection] = useState<string | undefined>(
      sharedTask.assignee_user_id ?? undefined
    );
    const [submitError, setSubmitError] = useState<string | null>(null);

    const isCurrentAssignee = sharedTask.assignee_user_id === userId;
    const organizationId = organization?.id ?? null;

    const membersQuery = useQuery({
      queryKey: ['tasks', 'reassign', 'members', organizationId],
      enabled: modal.visible && Boolean(organizationId),
      queryFn: async (): Promise<MemberOption[]> => {
        if (!organization || !organizationId) {
          throw new Error(
            'Organization context is required to reassign tasks.'
          );
        }

        const memberships = await organization.getMemberships();
        return memberships.data
          .map((membership: OrganizationMembershipResource) => {
            const memberUserId = membership.publicUserData?.userId;
            if (!memberUserId) {
              return null;
            }

            return {
              userId: memberUserId,
              label: buildMemberLabel(membership),
            };
          })
          .filter((member): member is MemberOption => Boolean(member))
          .sort((a, b) =>
            a.label.localeCompare(b.label, undefined, {
              sensitivity: 'base',
            })
          );
      },
      staleTime: 5 * 60 * 1000,
    });

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

    const organizationError =
      modal.visible && !organization
        ? 'Organization context is required to reassign tasks.'
        : null;

    const membersError =
      organizationError ??
      (membersQuery.isError ? 'Failed to load organization members.' : null);

    const memberOptions = membersQuery.data ?? [];

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
                  <SelectItem key={member.userId} value={member.userId}>
                    {member.userId === userId
                      ? `${member.label}`
                      : member.label}
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
