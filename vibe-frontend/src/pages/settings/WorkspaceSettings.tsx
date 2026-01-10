import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Loader2,
  Settings,
  Users,
  AlertTriangle,
  Trash2,
  UserMinus,
  LogOut,
  Crown,
  Shield,
  User,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '@clerk/clerk-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useTenantWorkspace, useTenantWorkspaces } from '@/hooks/useTenantWorkspaces';
import { useWorkspaceMembers } from '@/hooks/useWorkspaceMembers';
import type { TenantWorkspaceMember, WorkspaceMemberRole } from '@/types/workspace';

// Available colors for workspace
const WORKSPACE_COLORS = [
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#a855f7', // Purple
  '#d946ef', // Fuchsia
  '#ec4899', // Pink
  '#f43f5e', // Rose
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#14b8a6', // Teal
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
];

// Available icons for workspace
const WORKSPACE_ICONS = ['building', 'rocket', 'briefcase', 'zap', 'wrench', 'star', 'heart', 'globe'];

function getRoleIcon(role: WorkspaceMemberRole) {
  switch (role) {
    case 'owner':
      return <Crown className="h-4 w-4 text-amber-500" />;
    case 'admin':
      return <Shield className="h-4 w-4 text-blue-500" />;
    default:
      return <User className="h-4 w-4 text-muted-foreground" />;
  }
}

function getRoleBadgeVariant(role: WorkspaceMemberRole): 'default' | 'secondary' | 'outline' {
  switch (role) {
    case 'owner':
      return 'default';
    case 'admin':
      return 'secondary';
    default:
      return 'outline';
  }
}

export function WorkspaceSettings() {
  const navigate = useNavigate();
  const { user } = useUser();
  const { currentWorkspaceId } = useWorkspace();
  const { data: workspace, isLoading: loadingWorkspace } = useTenantWorkspace(currentWorkspaceId);
  const { updateWorkspace, deleteWorkspace, isUpdating, isDeleting } = useTenantWorkspaces();
  const {
    members,
    isLoading: loadingMembers,
    updateMemberRole,
    removeMember,
    isUpdating: isUpdatingRole,
    isRemoving,
  } = useWorkspaceMembers(currentWorkspaceId);

  // Form state
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Dialog state
  const [memberToRemove, setMemberToRemove] = useState<TenantWorkspaceMember | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);

  // Messages
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Current user's role
  const currentUserMember = members.find((m) => m.user_id === user?.id);
  const currentUserRole = currentUserMember?.role;
  const isOwner = currentUserRole === 'owner';
  const isAdmin = currentUserRole === 'admin' || isOwner;

  // Initialize form with workspace data
  useEffect(() => {
    if (workspace) {
      setName(workspace.name);
      setIcon(workspace.icon);
      setColor(workspace.color);
      setHasChanges(false);
    }
  }, [workspace]);

  // Track changes
  useEffect(() => {
    if (workspace) {
      const changed =
        name !== workspace.name || icon !== workspace.icon || color !== workspace.color;
      setHasChanges(changed);
    }
  }, [name, icon, color, workspace]);

  const handleSaveGeneral = async () => {
    if (!currentWorkspaceId) return;

    try {
      setError(null);
      await updateWorkspace(currentWorkspaceId, { name, icon, color });
      setSuccess('Workspace settings saved successfully');
      setHasChanges(false);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    }
  };

  const handleUpdateRole = async (memberId: string, newRole: WorkspaceMemberRole) => {
    const member = members.find((m) => m.id === memberId);
    if (!member) return;

    try {
      setError(null);
      await updateMemberRole(member.user_id, { role: newRole });
      setSuccess(`Updated ${member.email}'s role to ${newRole}`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
    }
  };

  const handleRemoveMember = async () => {
    if (!memberToRemove) return;

    try {
      setError(null);
      await removeMember(memberToRemove.user_id);
      setMemberToRemove(null);
      setSuccess(`Removed ${memberToRemove.email} from workspace`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member');
    }
  };

  const handleLeaveWorkspace = async () => {
    if (!user?.id) return;

    try {
      setError(null);
      await removeMember(user.id);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to leave workspace');
    }
  };

  const handleDeleteWorkspace = async () => {
    if (!currentWorkspaceId || deleteConfirmation !== workspace?.name) return;

    try {
      setError(null);
      await deleteWorkspace(currentWorkspaceId);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete workspace');
    }
  };

  if (!currentWorkspaceId) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-muted-foreground">No workspace selected</p>
      </div>
    );
  }

  if (loadingWorkspace) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading workspace settings...</span>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-muted-foreground">Workspace not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert>
          <AlertDescription className="font-medium">{success}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="general" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="members" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Members
          </TabsTrigger>
          <TabsTrigger value="danger" className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Danger Zone
          </TabsTrigger>
        </TabsList>

        {/* General Tab */}
        <TabsContent value="general" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Workspace Settings</CardTitle>
              <CardDescription>Customize your workspace appearance and settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="workspace-name">Workspace Name</Label>
                <Input
                  id="workspace-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Workspace"
                  disabled={!isAdmin}
                />
                {!isAdmin && (
                  <p className="text-xs text-muted-foreground">
                    Only admins and owners can edit workspace settings
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Color</Label>
                <div className="flex flex-wrap gap-2">
                  {WORKSPACE_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => isAdmin && setColor(c)}
                      disabled={!isAdmin}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        color === c ? 'border-foreground scale-110' : 'border-transparent'
                      } ${!isAdmin ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Icon</Label>
                <div className="flex flex-wrap gap-2">
                  {WORKSPACE_ICONS.map((i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => isAdmin && setIcon(i)}
                      disabled={!isAdmin}
                      className={`w-10 h-10 rounded-lg border flex items-center justify-center transition-all ${
                        icon === i
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:border-primary/50'
                      } ${!isAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {i === 'building' && '🏢'}
                      {i === 'rocket' && '🚀'}
                      {i === 'briefcase' && '💼'}
                      {i === 'zap' && '⚡'}
                      {i === 'wrench' && '🔧'}
                      {i === 'star' && '⭐'}
                      {i === 'heart' && '❤️'}
                      {i === 'globe' && '🌍'}
                    </button>
                  ))}
                </div>
              </div>

              {isAdmin && (
                <div className="flex justify-end">
                  <Button onClick={handleSaveGeneral} disabled={!hasChanges || isUpdating}>
                    {isUpdating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Save Changes
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Members Tab */}
        <TabsContent value="members" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Workspace Members</CardTitle>
              <CardDescription>
                Manage who has access to this workspace
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingMembers ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : members.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No members found</p>
              ) : (
                <div className="space-y-3">
                  {members.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={member.avatar_url || undefined} />
                          <AvatarFallback>
                            {member.display_name?.[0] || member.email[0].toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {member.display_name || member.email}
                            </span>
                            {member.user_id === user?.id && (
                              <Badge variant="outline" className="text-xs">
                                You
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{member.email}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {isOwner && member.role !== 'owner' ? (
                          <Select
                            value={member.role}
                            onValueChange={(value) =>
                              handleUpdateRole(member.id, value as WorkspaceMemberRole)
                            }
                            disabled={isUpdatingRole}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">
                                <div className="flex items-center gap-2">
                                  {getRoleIcon('admin')}
                                  Admin
                                </div>
                              </SelectItem>
                              <SelectItem value="member">
                                <div className="flex items-center gap-2">
                                  {getRoleIcon('member')}
                                  Member
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant={getRoleBadgeVariant(member.role)}>
                            <span className="flex items-center gap-1">
                              {getRoleIcon(member.role)}
                              {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                            </span>
                          </Badge>
                        )}

                        {isAdmin &&
                          member.role !== 'owner' &&
                          member.user_id !== user?.id && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setMemberToRemove(member)}
                            >
                              <UserMinus className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Danger Zone Tab */}
        <TabsContent value="danger" className="space-y-4 mt-4">
          {/* Leave Workspace (non-owners) */}
          {!isOwner && (
            <Card className="border-destructive/50">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <LogOut className="h-5 w-5 text-destructive" />
                  <CardTitle className="text-destructive">Leave Workspace</CardTitle>
                </div>
                <CardDescription>
                  Leave this workspace. You will lose access to all teams and projects.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="destructive" onClick={() => setShowLeaveDialog(true)}>
                  Leave Workspace
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Delete Workspace (owners only) */}
          {isOwner && (
            <Card className="border-destructive/50">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Trash2 className="h-5 w-5 text-destructive" />
                  <CardTitle className="text-destructive">Delete Workspace</CardTitle>
                </div>
                <CardDescription>
                  Permanently delete this workspace and all its data. This action cannot be undone.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
                  Delete Workspace
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Remove Member Dialog */}
      <Dialog open={!!memberToRemove} onOpenChange={() => setMemberToRemove(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Member</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove {memberToRemove?.email} from this workspace?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMemberToRemove(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRemoveMember} disabled={isRemoving}>
              {isRemoving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Leave Workspace Dialog */}
      <Dialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave Workspace</DialogTitle>
            <DialogDescription>
              Are you sure you want to leave "{workspace.name}"? You will lose access to all teams
              and projects in this workspace.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLeaveDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleLeaveWorkspace} disabled={isRemoving}>
              {isRemoving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Leave Workspace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Workspace Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Workspace</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete the workspace "
              {workspace.name}" and all of its data.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm">
              Please type <strong>{workspace.name}</strong> to confirm:
            </p>
            <Input
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              placeholder={workspace.name}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteDialog(false);
                setDeleteConfirmation('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteWorkspace}
              disabled={deleteConfirmation !== workspace.name || isDeleting}
            >
              {isDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete Workspace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
