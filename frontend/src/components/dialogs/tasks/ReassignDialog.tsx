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

    const [memberOptions, setMemberOptions] = useState<MemberOption[]>([]);
    const [membersLoading, setMembersLoading] = useState(false);
    const [membersError, setMembersError] = useState<string | null>(null);
    const [selection, setSelection] = useState<string | undefined>(
      sharedTask.assignee_user_id ?? undefined
    );
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const isCurrentAssignee = sharedTask.assignee_user_id === userId;

    useEffect(() => {
      if (!modal.visible) {
        return;
      }

      const loadMembers = async () => {
        if (!organization) {
          setMembersError(
            'Organization context is required to reassign tasks.'
          );
          setMembersLoading(false);
          return;
        }

        setMembersLoading(true);
        setMembersError(null);

        try {
          const memberships = await organization.getMemberships();
          const mapped: MemberOption[] = memberships.data
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

          setMemberOptions(mapped);
        } catch (error) {
          setMembersError('Failed to load organization members.');
        } finally {
          setMembersLoading(false);
        }
      };

      loadMembers();
      return;
    }, [modal.visible, organization]);

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

    const handleConfirm = async () => {
      if (isSubmitting) {
        return;
      }

      if (!selection) {
        setSubmitError('Select an assignee before reassigning.');
        return;
      }

      setSubmitError(null);
      setIsSubmitting(true);
      try {
        const result = await tasksApi.transferAssignment(sharedTask.id, {
          new_assignee_user_id: selection,
          version: sharedTask.version,
        });
        modal.resolve(result.shared_task);
        modal.hide();
      } catch (error) {
        const status =
          error && typeof error === 'object' && 'status' in error
            ? (error as { status?: number }).status
            : undefined;

        if (status === 401 || status === 403) {
          setSubmitError('Only the current assignee can reassign this task.');
        } else if (status === 409) {
          setSubmitError('The task assignment changed. Refresh and try again.');
        } else {
          setSubmitError('Failed to reassign. Try again.');
        }
      } finally {
        setIsSubmitting(false);
      }
    };

    const canSubmit =
      isCurrentAssignee &&
      !isSubmitting &&
      !membersLoading &&
      !membersError &&
      selection !== undefined &&
      selection !== (sharedTask.assignee_user_id ?? undefined);

    return (
      <Dialog
        open={modal.visible}
        onOpenChange={(open) => {
          if (!open) {
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
              disabled={!isCurrentAssignee || membersLoading}
              value={selection}
              onValueChange={(value) => {
                setSelection(value);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue
                  placeholder={
                    membersLoading ? 'Loading members...' : 'Select an assignee'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {memberOptions.map((member) => (
                  <SelectItem key={member.userId} value={member.userId}>
                    {member.userId === userId
                      ? `${member.label} (you)`
                      : member.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {membersLoading && (
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
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={!canSubmit}>
              {isSubmitting ? (
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
