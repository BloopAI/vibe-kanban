import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { useGitHubStatus, useGitHubProjects } from '@/hooks/useGitHubIntegration';
import { defineModal } from '@/lib/modals';
import {
  Loader2,
  Search,
  GitBranch,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Lock,
  Globe,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GitHubProject } from 'shared/types';

export interface GitHubProjectSelectorDialogProps {}

export type GitHubProjectSelectorDialogResult =
  | { status: 'selected'; project: GitHubProject }
  | { status: 'canceled' };

const GitHubProjectSelectorDialogImpl =
  NiceModal.create<GitHubProjectSelectorDialogProps>(() => {
    const modal = useModal();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedProject, setSelectedProject] = useState<GitHubProject | null>(
      null
    );

    // GitHub CLI status
    const { data: status, isLoading: statusLoading } = useGitHubStatus();

    // GitHub Projects
    const {
      data: projects,
      isLoading: projectsLoading,
      error: projectsError,
    } = useGitHubProjects({
      enabled: status?.available && status?.authenticated,
    });

    const isGitHubAvailable = status?.available && status?.authenticated;

    // Filter projects based on search
    const filteredProjects = useMemo(() => {
      if (!projects) return [];
      if (!searchQuery.trim()) return projects;

      const query = searchQuery.toLowerCase();
      return projects.filter(
        (p) =>
          p.title.toLowerCase().includes(query) ||
          p.ownerLogin.toLowerCase().includes(query) ||
          (p.shortDescription?.toLowerCase().includes(query) ?? false)
      );
    }, [projects, searchQuery]);

    // Reset state when dialog opens
    useEffect(() => {
      if (modal.visible) {
        setSearchQuery('');
        setSelectedProject(null);
      }
    }, [modal.visible]);

    const handleSelect = () => {
      if (!selectedProject) return;

      modal.resolve({
        status: 'selected',
        project: selectedProject,
      } as GitHubProjectSelectorDialogResult);
      modal.hide();
    };

    const handleCancel = () => {
      modal.resolve({ status: 'canceled' } as GitHubProjectSelectorDialogResult);
      modal.hide();
    };

    const handleOpenChange = (open: boolean) => {
      if (!open) {
        handleCancel();
      }
    };

    return (
      <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitBranch className="h-5 w-5" />
              Select GitHub Project
            </DialogTitle>
            <DialogDescription>
              Choose a GitHub Project to link with this Vibe project. Issues will
              be synced as tasks.
            </DialogDescription>
          </DialogHeader>

          {/* Status Check */}
          {statusLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="ml-2 text-sm text-muted-foreground">
                Checking GitHub CLI...
              </span>
            </div>
          ) : !isGitHubAvailable ? (
            <div className="space-y-4">
              <Alert variant="destructive">
                <AlertDescription className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 flex-shrink-0" />
                  <div>
                    {!status?.available
                      ? 'GitHub CLI is not installed. Please install it first.'
                      : 'GitHub CLI is not authenticated. Please run `gh auth login`.'}
                  </div>
                </AlertDescription>
              </Alert>
              <DialogFooter>
                <Button variant="outline" onClick={handleCancel}>
                  Close
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <>
              {/* Search */}
              <div className="space-y-2">
                <Label htmlFor="project-search" className="sr-only">
                  Search projects
                </Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="project-search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search projects..."
                    className="pl-9"
                    autoFocus
                  />
                </div>
              </div>

              {/* Projects List */}
              <div className="flex-1 overflow-y-auto min-h-[200px] max-h-[400px] -mx-6 px-6">
                {projectsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="ml-2 text-sm text-muted-foreground">
                      Loading projects...
                    </span>
                  </div>
                ) : projectsError ? (
                  <Alert variant="destructive">
                    <AlertDescription>
                      Failed to load GitHub Projects. Please try again.
                    </AlertDescription>
                  </Alert>
                ) : filteredProjects.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    {projects?.length === 0
                      ? 'No GitHub Projects found. Create one on GitHub first.'
                      : 'No projects match your search.'}
                  </div>
                ) : (
                  <div className="space-y-2 py-2">
                    <AnimatePresence mode="popLayout">
                      {filteredProjects.map((project) => (
                        <GitHubProjectCard
                          key={project.id}
                          project={project}
                          isSelected={selectedProject?.id === project.id}
                          onSelect={() => setSelectedProject(project)}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={handleCancel}>
                  Cancel
                </Button>
                <Button onClick={handleSelect} disabled={!selectedProject}>
                  {selectedProject ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Link Project
                    </>
                  ) : (
                    'Select a Project'
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    );
  });

interface GitHubProjectCardProps {
  project: GitHubProject;
  isSelected: boolean;
  onSelect: () => void;
}

function GitHubProjectCard({
  project,
  isSelected,
  onSelect,
}: GitHubProjectCardProps) {
  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.15 }}
      onClick={onSelect}
      className={cn(
        'w-full text-left p-3 rounded-lg border transition-all',
        'hover:border-foreground/30 hover:bg-muted/50',
        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
        isSelected
          ? 'border-foreground bg-muted ring-2 ring-ring ring-offset-2'
          : 'border-border'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{project.title}</span>
            <Badge
              variant="secondary"
              className="flex-shrink-0 text-xs h-5 px-1.5"
            >
              #{Number(project.number)}
            </Badge>
            {project.public ? (
              <Globe className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            ) : (
              <Lock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
            <span>{project.ownerLogin}</span>
            {project.closed && (
              <Badge variant="outline" className="text-xs h-4">
                Closed
              </Badge>
            )}
          </div>
          {project.shortDescription && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {project.shortDescription}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isSelected && (
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          )}
          <a
            href={project.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>
    </motion.button>
  );
}

export const GitHubProjectSelectorDialog = defineModal<
  GitHubProjectSelectorDialogProps,
  GitHubProjectSelectorDialogResult
>(GitHubProjectSelectorDialogImpl);
