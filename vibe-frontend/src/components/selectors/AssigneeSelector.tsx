import { useState, useCallback, useEffect } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { User, UserPlus, Mail, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TeamMember {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
}

interface AssigneeSelectorProps {
  value: string | null;
  onChange: (assigneeId: string | null) => void;
  teamMembers?: TeamMember[];
  disabled?: boolean;
  variant?: 'button' | 'avatar' | 'pill';
  size?: 'sm' | 'default';
  enableKeyboardShortcuts?: boolean;
  onInvite?: () => void;
  onNewUser?: () => void;
}

export function AssigneeSelector({
  value,
  onChange,
  teamMembers = [],
  disabled = false,
  variant = 'button',
  size = 'sm',
  enableKeyboardShortcuts = true,
  onInvite,
  onNewUser,
}: AssigneeSelectorProps) {
  const [open, setOpen] = useState(false);

  const selectedMember = teamMembers.find((m) => m.id === value);

  // Handle keyboard shortcuts when dropdown is open
  useEffect(() => {
    if (!open || !enableKeyboardShortcuts) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Number shortcuts for quick selection (1-9)
      if (e.key >= '1' && e.key <= '9') {
        const index = parseInt(e.key, 10) - 1;
        if (index < teamMembers.length) {
          e.preventDefault();
          onChange(teamMembers[index].id);
          setOpen(false);
        }
      }
      // 0 to unassign
      if (e.key === '0') {
        e.preventDefault();
        onChange(null);
        setOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, enableKeyboardShortcuts, onChange, teamMembers]);

  const handleSelect = useCallback((memberId: string | null) => {
    onChange(memberId);
    setOpen(false);
  }, [onChange]);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const renderAvatar = (member?: TeamMember, className?: string) => {
    if (!member) {
      return (
        <div className={cn(
          'flex items-center justify-center rounded-full border border-dashed border-muted-foreground/40',
          'text-muted-foreground',
          className || 'h-6 w-6'
        )}>
          <User className="h-3.5 w-3.5" />
        </div>
      );
    }

    if (member.avatar) {
      return (
        <img
          src={member.avatar}
          alt={member.name}
          className={cn('rounded-full object-cover', className || 'h-6 w-6')}
        />
      );
    }

    return (
      <div className={cn(
        'flex items-center justify-center rounded-full bg-primary/10 text-primary font-medium',
        className || 'h-6 w-6 text-xs'
      )}>
        {getInitials(member.name)}
      </div>
    );
  };

  const renderTrigger = () => {
    switch (variant) {
      case 'avatar':
        return (
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-6 w-6 p-0 rounded-full',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
            disabled={disabled}
          >
            {renderAvatar(selectedMember)}
          </Button>
        );
      case 'pill':
        return (
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'h-6 gap-1.5 px-2 text-xs rounded-full',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
            disabled={disabled}
          >
            {renderAvatar(selectedMember, 'h-4 w-4 text-[10px]')}
            {selectedMember ? (
              <span>{selectedMember.name}</span>
            ) : (
              <span className="text-muted-foreground">Unassigned</span>
            )}
          </Button>
        );
      default:
        return (
          <Button
            variant="outline"
            size={size}
            className={cn(
              'gap-2 px-3 text-xs font-medium rounded-md',
              'border-border/60 hover:bg-accent/50',
              size === 'sm' && 'h-8',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
            disabled={disabled}
          >
            {renderAvatar(selectedMember, 'h-4 w-4 text-[10px]')}
            {selectedMember?.name || 'Assignee'}
          </Button>
        );
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild disabled={disabled}>
        {renderTrigger()}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {/* Unassign option */}
        <DropdownMenuItem
          onClick={() => handleSelect(null)}
          className={cn('cursor-pointer gap-2', !value && 'bg-accent')}
        >
          <div className="h-6 w-6 rounded-full border border-dashed border-muted-foreground/40 flex items-center justify-center">
            <X className="h-3 w-3 text-muted-foreground" />
          </div>
          <span>No assignee</span>
        </DropdownMenuItem>

        {teamMembers.length > 0 && <DropdownMenuSeparator />}

        {/* Team members */}
        {teamMembers.map((member) => {
          const isSelected = value === member.id;
          return (
            <DropdownMenuItem
              key={member.id}
              onClick={() => handleSelect(member.id)}
              className={cn('cursor-pointer gap-2', isSelected && 'bg-accent')}
            >
              {renderAvatar(member)}
              <div className="flex flex-col flex-1 min-w-0">
                <span className="truncate">{member.name}</span>
                {member.email && (
                  <span className="text-xs text-muted-foreground truncate">{member.email}</span>
                )}
              </div>
            </DropdownMenuItem>
          );
        })}

        {/* Action items */}
        {(onNewUser || onInvite) && (
          <>
            <DropdownMenuSeparator />
            {onNewUser && (
              <DropdownMenuItem onClick={onNewUser} className="cursor-pointer gap-2">
                <UserPlus className="h-4 w-4 text-muted-foreground" />
                <span>New user</span>
              </DropdownMenuItem>
            )}
            {onInvite && (
              <DropdownMenuItem onClick={onInvite} className="cursor-pointer gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>Invite and assign</span>
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Hook to enable global A key shortcut to open assignee selector
export function useAssigneeKeyboardShortcut(
  onOpen: () => void,
  enabled: boolean = true
) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only trigger on 'A' key when not in an input/textarea
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      if (!isInput && e.key.toLowerCase() === 'a' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        onOpen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onOpen, enabled]);
}
