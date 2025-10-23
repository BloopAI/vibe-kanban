import { useEffect, useMemo, useState } from 'react';
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

export interface TransferAssignmentDialogProps {
  sharedTask: SharedTaskRecord;
}

type MemberOption = {
  userId: string;
  label: string;
};

const UNASSIGNED_VALUE = '__unassigned__';

export const TransferAssignmentDialog =
  NiceModal.create<TransferAssignmentDialogProps>(({ sharedTask }) => {
    const modal = useModal();
    const { organization } = useOrganization();
    const { userId } = useAuth();

    const [memberOptions, setMemberOptions] = useState<MemberOption[]>([]);
    const [membersLoading, setMembersLoading] = useState(false);
    const [membersError, setMembersError] = useState<string | null>(null);
    const [selection, setSelection] = useState<string | null>(
      sharedTask.assignee_user_id
    );
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const isCurrentAssignee = sharedTask.assignee_user_id === userId;

    useEffect(() => {
      if (!modal.visible) {
        return;
      }

      let cancelled = false;
      const loadMembers = async () => {
        if (!organization) {
          setMembersError(
            'Organization context is required to transfer tasks.'
          );
          setMembersLoading(false);
          return;
        }

        setMembersLoading(true);
        setMembersError(null);
        try {
          const memberships = await organization.getMembershipList({
            limit: 200,
          });

          if (cancelled) return;

          const mapped: MemberOption[] = memberships
            .map((membership) => {
              const memberUserId = membership.publicUserData?.userId;
              if (!memberUserId) {
                return null;
              }

              const firstName = membership.publicUserData?.firstName ?? '';
              const lastName = membership.publicUserData?.lastName ?? '';
              const identifier =
                membership.publicUserData?.identifier ?? memberUserId;
              const fullName = `${firstName} ${lastName}`.trim();

              return {
                userId: memberUserId,
                label: fullName.length > 0 ? fullName : identifier,
              };
            })
            .filter((member): member is MemberOption => Boolean(member));

          setMemberOptions(mapped);
        } catch (error) {
          if (cancelled) return;
          setMembersError('Failed to load organization members.');
        } finally {
          if (!cancelled) {
            setMembersLoading(false);
          }
        }
      };

      loadMembers();

      return () => {
        cancelled = true;
      };
    }, [modal.visible, organization]);

    useEffect(() => {
      if (!modal.visible) {
        return;
      }
      setSelection(sharedTask.assignee_user_id);
      setSubmitError(null);
    }, [modal.visible, sharedTask.assignee_user_id]);

    const currentAssigneeLabel = useMemo(() => {
      if (!sharedTask.assignee_user_id) {
        return 'Unassigned';
      }

      const currentMember = memberOptions.find(
        (member) => member.userId === sharedTask.assignee_user_id
      );

      if (currentMember) {
        return currentMember.userId === userId
          ? `${currentMember.label} (you)`
          : currentMember.label;
      }

      if (sharedTask.assignee_user_id === userId) {
        return 'You';
      }

      return sharedTask.assignee_user_id;
    }, [memberOptions, sharedTask.assignee_user_id, userId]);

    const handleClose = () => {
      modal.resolve(null);
      modal.hide();
    };

    const handleConfirm = async () => {
      if (isSubmitting) {
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
          setSubmitError('Only the current assignee can transfer this task.');
        } else if (status === 409) {
          setSubmitError('The task assignment changed. Refresh and try again.');
        } else {
          setSubmitError('Failed to transfer the assignment. Try again.');
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
      (selection ?? null) !== (sharedTask.assignee_user_id ?? null);

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
            <DialogTitle>Transfer assignment</DialogTitle>
            <DialogDescription>
              Move this shared task to another organization member or clear the
              assignee.
            </DialogDescription>
          </DialogHeader>

          {!isCurrentAssignee && (
            <Alert variant="destructive">
              You must be the current assignee to transfer this task.
            </Alert>
          )}

          {membersError && <Alert variant="destructive">{membersError}</Alert>}

          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Current assignee: {currentAssigneeLabel}
            </div>
            <Select
              disabled={!isCurrentAssignee || membersLoading}
              value={selection ?? UNASSIGNED_VALUE}
              onValueChange={(value) => {
                if (value === UNASSIGNED_VALUE) {
                  setSelection(null);
                  return;
                }
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
                <SelectItem value={UNASSIGNED_VALUE}>Unassigned</SelectItem>
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
                  Transferring...
                </span>
              ) : (
                'Transfer'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  });
