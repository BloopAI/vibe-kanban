import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Edit2, Trash2, Loader2 } from 'lucide-react';
import { tagsApi } from '@/lib/api';
import { showTaskTagEdit } from '@/lib/modals';
import type { TaskTag } from 'shared/types';

interface TaskTagManagerProps {
  projectId?: string;
  isGlobal?: boolean;
}

export function TaskTagManager({
  projectId,
  isGlobal = false,
}: TaskTagManagerProps) {
  const [tags, setTags] = useState<TaskTag[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTags = useCallback(async () => {
    setLoading(true);
    try {
      const data = isGlobal
        ? await tagsApi.listGlobal()
        : projectId
          ? await tagsApi.listByProject(projectId)
          : [];

      // Filter to show only tags for this specific scope
      const filtered = data.filter((tag) =>
        isGlobal
          ? tag.project_id === null
          : tag.project_id === projectId
      );

      setTags(filtered);
    } catch (err) {
      console.error('Failed to fetch tags:', err);
    } finally {
      setLoading(false);
    }
  }, [isGlobal, projectId]);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  const handleOpenDialog = useCallback(
    async (tag?: TaskTag) => {
      try {
        const result = await showTaskTagEdit({
          tag: tag || null,
          projectId,
          isGlobal,
        });

        if (result === 'saved') {
          await fetchTags();
        }
      } catch (error) {
        // User cancelled - do nothing
      }
    },
    [projectId, isGlobal, fetchTags]
  );

  const handleDelete = useCallback(
    async (tag: TaskTag) => {
      if (
        !confirm(
          `Are you sure you want to delete the tag "${tag.tag_name}"?`
        )
      ) {
        return;
      }

      try {
        await tagsApi.delete(tag.id);
        await fetchTags();
      } catch (err) {
        console.error('Failed to delete tag:', err);
      }
    },
    [fetchTags]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">
          {isGlobal ? 'Global Task Tags' : 'Project Task Tags'}
        </h3>
        <Button onClick={() => handleOpenDialog()} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add Tag
        </Button>
      </div>

      {tags.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No tags yet. Create your first tag to reuse content in task descriptions with @tag_name
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <div className="max-h-[400px] overflow-auto">
            <table className="w-full">
              <thead className="border-b bg-muted/50 sticky top-0">
                <tr>
                  <th className="text-left p-2 text-sm font-medium">
                    Tag Name
                  </th>
                  <th className="text-left p-2 text-sm font-medium">
                    Content
                  </th>
                  <th className="text-right p-2 text-sm font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {tags.map((tag) => (
                  <tr
                    key={tag.id}
                    className="border-b hover:bg-muted/30 transition-colors"
                  >
                    <td className="p-2 text-sm font-medium">
                      @{tag.tag_name}
                    </td>
                    <td className="p-2 text-sm">
                      <div
                        className="max-w-[400px] truncate"
                        title={tag.content || ''}
                      >
                        {tag.content || (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </div>
                    </td>
                    <td className="p-2">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleOpenDialog(tag)}
                          title="Edit tag"
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleDelete(tag)}
                          title="Delete tag"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
