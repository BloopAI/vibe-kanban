import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { useTranslation } from 'react-i18next';
import type { User } from 'shared/remote-types';
import { defineModal } from '@/lib/modals';
import { CommandDialog } from '@/components/ui-new/primitives/Command';
import {
  MultiSelectCommandBar,
  type MultiSelectOption,
} from '@/components/ui-new/primitives/MultiSelectCommandBar';
import { UserAvatar } from '@/components/ui-new/primitives/UserAvatar';

export interface AssigneeSelectionDialogProps {
  users: User[];
  initialAssigneeIds: string[];
  onConfirm: (assigneeIds: string[]) => void;
}

const getUserDisplayName = (user: User): string => {
  return (
    [user.first_name, user.last_name].filter(Boolean).join(' ') ||
    user.username ||
    'User'
  );
};

const AssigneeSelectionDialogImpl =
  NiceModal.create<AssigneeSelectionDialogProps>(
    ({ users, initialAssigneeIds, onConfirm }) => {
      const { t } = useTranslation('common');
      const modal = useModal();
      const previousFocusRef = useRef<HTMLElement | null>(null);

      const [selectedIds, setSelectedIds] =
        useState<string[]>(initialAssigneeIds);
      const [search, setSearch] = useState('');

      // Capture focus when dialog opens
      useEffect(() => {
        if (modal.visible) {
          previousFocusRef.current = document.activeElement as HTMLElement;
          setSelectedIds(initialAssigneeIds);
          setSearch('');
        }
      }, [modal.visible, initialAssigneeIds]);

      const options: MultiSelectOption<string>[] = useMemo(
        () =>
          users.map((user) => ({
            value: user.id,
            label: getUserDisplayName(user),
            searchValue: `${user.id} ${getUserDisplayName(user)} ${user.email ?? ''}`,
            renderOption: () => (
              <div className="flex items-center gap-base">
                <UserAvatar user={user} className="h-5 w-5 text-[10px]" />
                <span>{getUserDisplayName(user)}</span>
              </div>
            ),
          })),
        [users]
      );

      const handleToggle = useCallback((userId: string) => {
        setSelectedIds((prev) =>
          prev.includes(userId)
            ? prev.filter((id) => id !== userId)
            : [...prev, userId]
        );
      }, []);

      const handleConfirm = useCallback(() => {
        onConfirm(selectedIds);
        modal.hide();
      }, [selectedIds, onConfirm, modal]);

      // Restore focus when dialog closes
      const handleCloseAutoFocus = useCallback((event: Event) => {
        event.preventDefault();
        previousFocusRef.current?.focus();
      }, []);

      return (
        <CommandDialog
          open={modal.visible}
          onOpenChange={(open) => !open && modal.hide()}
          onCloseAutoFocus={handleCloseAutoFocus}
        >
          <MultiSelectCommandBar
            title={t('kanban.selectAssignees', 'Select assignees...')}
            options={options}
            selectedValues={selectedIds}
            onToggle={handleToggle}
            onConfirm={handleConfirm}
            search={search}
            onSearchChange={setSearch}
          />
        </CommandDialog>
      );
    }
  );

export const AssigneeSelectionDialog = defineModal<
  AssigneeSelectionDialogProps,
  void
>(AssigneeSelectionDialogImpl);
