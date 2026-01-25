import {
  BuildingsIcon,
  CheckIcon,
  PlusIcon,
  SignInIcon,
  SignOutIcon,
  UserIcon,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import type { OrganizationWithRole } from 'shared/types';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from './Dropdown';

interface AppBarUserPopoverProps {
  isSignedIn: boolean;
  avatarUrl: string | null;
  organizations: OrganizationWithRole[];
  selectedOrgId: string;
  onOrgSelect: (orgId: string) => void;
  onCreateOrg?: () => void;
  onSignIn: () => void;
  onLogout: () => void;
}

export function AppBarUserPopover({
  isSignedIn,
  avatarUrl,
  organizations,
  selectedOrgId,
  onOrgSelect,
  onCreateOrg,
  onSignIn,
  onLogout,
}: AppBarUserPopoverProps) {
  if (!isSignedIn) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex items-center justify-center w-10 h-10 rounded-lg',
              'bg-panel text-normal font-medium text-sm',
              'transition-colors cursor-pointer',
              'hover:bg-panel/70',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand'
            )}
            aria-label="Sign in"
          >
            <UserIcon className="size-icon-sm" weight="bold" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="end" className="min-w-[200px]">
          <DropdownMenuItem icon={SignInIcon} onClick={onSignIn}>
            Sign in
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center justify-center w-10 h-10 rounded-lg',
            'transition-colors cursor-pointer overflow-hidden',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand',
            !avatarUrl && 'bg-panel text-normal font-medium text-sm',
            !avatarUrl && 'hover:bg-panel/70'
          )}
          aria-label="Account"
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt="User avatar"
              className="w-full h-full object-cover"
            />
          ) : (
            <UserIcon className="size-icon-sm" weight="bold" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" className="min-w-[200px]">
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {organizations.map((org) => (
          <DropdownMenuItem
            key={org.id}
            icon={org.id === selectedOrgId ? CheckIcon : BuildingsIcon}
            onClick={() => onOrgSelect(org.id)}
            className={cn(org.id === selectedOrgId && 'bg-brand/10')}
          >
            {org.name}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={PlusIcon} onClick={onCreateOrg}>
          Create organization
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={SignOutIcon} onClick={onLogout}>
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
