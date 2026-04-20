import { useState, useRef, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PlusIcon,
  PencilSimpleIcon,
  TrashIcon,
  KanbanIcon,
  CheckIcon,
  XIcon,
} from '@phosphor-icons/react';
import { cn } from '@/shared/lib/utils';
import { kanbanProjectsApi } from '@/shared/lib/kanbanApi';
import type { KanbanProject } from 'shared/types';

const PROJECT_COLORS = [
  '#6366f1',
  '#f59e0b',
  '#10b981',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
  '#14b8a6',
];

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex gap-1 flex-wrap">
      {PROJECT_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          className={cn(
            'w-5 h-5 rounded-full cursor-pointer border-2 transition-transform hover:scale-110',
            value === color ? 'border-white scale-110' : 'border-transparent'
          )}
          style={{ backgroundColor: color }}
          onClick={() => onChange(color)}
          aria-label={color}
        />
      ))}
    </div>
  );
}

function ProjectCard({
  project,
  onRename,
  onDelete,
  onNavigate,
}: {
  project: KanbanProject;
  onRename: (id: string, name: string, color: string) => void;
  onDelete: (id: string) => void;
  onNavigate: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(project.name);
  const [editColor, setEditColor] = useState(project.color);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const handleSave = () => {
    if (editName.trim()) {
      onRename(project.id, editName.trim(), editColor);
    }
    setEditing(false);
  };

  const handleCancel = () => {
    setEditName(project.name);
    setEditColor(project.color);
    setEditing(false);
  };

  return (
    <div className="group relative bg-secondary border border-border rounded-lg overflow-hidden hover:border-brand transition-colors">
      {/* Color bar */}
      <div className="h-1" style={{ backgroundColor: project.color }} />

      <div className="p-4">
        {editing ? (
          <div className="space-y-3">
            <input
              ref={inputRef}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') handleCancel();
              }}
              className="w-full px-2 py-1 bg-primary border border-border rounded text-base text-high focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <ColorPicker value={editColor} onChange={setEditColor} />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSave}
                className="flex items-center gap-1 px-2 py-1 bg-brand text-white rounded text-sm cursor-pointer hover:opacity-90"
              >
                <CheckIcon className="h-3 w-3" weight="bold" />
                Save
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="flex items-center gap-1 px-2 py-1 bg-primary border border-border text-low rounded text-sm cursor-pointer hover:text-normal"
              >
                <XIcon className="h-3 w-3" weight="bold" />
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              className="w-full text-left"
              onClick={() => onNavigate(project.id)}
            >
              <div className="flex items-center gap-2 mb-1">
                <KanbanIcon
                  className="h-4 w-4 flex-shrink-0"
                  style={{ color: project.color }}
                />
                <span className="text-lg font-medium text-high truncate">
                  {project.name}
                </span>
              </div>
              <p className="text-sm text-low">Open kanban board →</p>
            </button>

            {/* Action buttons — visible on hover */}
            <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                title="Rename project"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing(true);
                }}
                className="p-1 rounded bg-primary border border-border text-low hover:text-normal cursor-pointer"
              >
                <PencilSimpleIcon className="h-3 w-3" />
              </button>
              <button
                type="button"
                title="Delete project"
                onClick={(e) => {
                  e.stopPropagation();
                  if (
                    confirm(
                      `Delete "${project.name}"? All issues will be permanently removed.`
                    )
                  ) {
                    onDelete(project.id);
                  }
                }}
                className="p-1 rounded bg-primary border border-border text-low hover:text-error cursor-pointer"
              >
                <TrashIcon className="h-3 w-3" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CreateProjectCard({ onCreated }: { onCreated: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(PROJECT_COLORS[0]);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { mutate: create, isPending } = useMutation({
    mutationFn: () =>
      kanbanProjectsApi.create({ id: null, name: name.trim(), color }),
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: ['kanban-projects'] });
      setName('');
      setColor(PROJECT_COLORS[0]);
      setOpen(false);
      onCreated(project.id);
    },
  });

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex flex-col items-center justify-center gap-2 h-full min-h-[120px] bg-secondary border border-dashed border-border rounded-lg text-low hover:text-normal hover:border-brand transition-colors cursor-pointer"
      >
        <PlusIcon className="h-6 w-6" />
        <span className="text-sm">New project</span>
      </button>
    );
  }

  return (
    <div className="bg-secondary border border-brand rounded-lg overflow-hidden">
      <div className="h-1" style={{ backgroundColor: color }} />
      <div className="p-4 space-y-3">
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Project name…"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim()) create();
            if (e.key === 'Escape') setOpen(false);
          }}
          className="w-full px-2 py-1 bg-primary border border-border rounded text-base text-high placeholder:text-low focus:outline-none focus:ring-1 focus:ring-brand"
        />
        <ColorPicker value={color} onChange={setColor} />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!name.trim() || isPending}
            onClick={() => create()}
            className="flex items-center gap-1 px-2 py-1 bg-brand text-white rounded text-sm cursor-pointer hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <PlusIcon className="h-3 w-3" weight="bold" />
            {isPending ? 'Creating…' : 'Create'}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex items-center gap-1 px-2 py-1 bg-primary border border-border text-low rounded text-sm cursor-pointer hover:text-normal"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProjectsLanding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['kanban-projects'],
    queryFn: () => kanbanProjectsApi.list(),
  });

  const { mutate: renameProject } = useMutation({
    mutationFn: ({
      id,
      name,
      color,
    }: {
      id: string;
      name: string;
      color: string;
    }) => kanbanProjectsApi.update(id, { name, color, sort_order: null }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['kanban-projects'] }),
  });

  const { mutate: deleteProject } = useMutation({
    mutationFn: (id: string) => kanbanProjectsApi.delete(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['kanban-projects'] }),
  });

  const handleNavigate = (projectId: string) => {
    void navigate({ to: '/projects/$projectId', params: { projectId } });
  };

  return (
    <div className="flex flex-col h-full bg-primary">
      {/* Header */}
      <div className="px-8 pt-8 pb-4 border-b border-border">
        <div className="flex items-center gap-3 mb-1">
          <KanbanIcon className="h-6 w-6 text-brand" />
          <h1 className="text-xl font-semibold text-high">Projects</h1>
        </div>
        <p className="text-sm text-low">
          Each project is a kanban board. Issues inside a project can have
          workspaces — coding sessions that run on any connected instance.
        </p>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {isLoading ? (
          <div className="text-sm text-low">Loading projects…</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onRename={(id, name, color) =>
                  renameProject({ id, name, color })
                }
                onDelete={(id) => deleteProject(id)}
                onNavigate={handleNavigate}
              />
            ))}
            <CreateProjectCard onCreated={handleNavigate} />
          </div>
        )}
      </div>
    </div>
  );
}
