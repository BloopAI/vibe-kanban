import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@vibe/ui/components/Dialog';

const statuses = [
  ['todo', 'To do'],
  ['inprogress', 'In progress'],
  ['inreview', 'In review'],
  ['done', 'Done'],
  ['cancelled', 'Cancelled'],
] as const;
type Status = (typeof statuses)[number][0];
type Board = { id: string; name: string };
type Task = {
  id: string;
  board_id: string;
  title: string;
  description: string;
  status: Status;
};
type Editor =
  | { kind: 'board'; id?: string; name: string }
  | {
      kind: 'task';
      id?: string;
      boardId: string;
      title: string;
      description: string;
      status: Status;
    }
  | {
      kind: 'delete';
      path: string;
      label: string;
      boardId: string;
      isBoard: boolean;
    };

async function api<T>(
  path: string,
  method = 'GET',
  payload?: unknown
): Promise<T> {
  const response = await fetch(`/api/local-boards${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(
      result.message || `Could not save changes (${response.status})`
    );
  }
  return result.data;
}

const button =
  'rounded-sm border border-border px-base py-half text-sm text-normal hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed';
const input =
  'w-full rounded-sm border border-border bg-primary px-base py-half text-normal focus:outline-none focus:ring-1 focus:ring-brand';

export function LocalBoardPage() {
  const cache = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const boards = useQuery({
    queryKey: ['local-boards'],
    queryFn: () => api<Board[]>(''),
  });
  const active =
    boards.data?.find((board) => board.id === selectedId) ?? boards.data?.[0];
  const tasks = useQuery({
    queryKey: ['local-board-tasks', active?.id],
    queryFn: () => api<Task[]>(`/${active!.id}/tasks`),
    enabled: !!active,
  });

  const open = (value: Editor) => {
    setError('');
    setEditor(value);
  };
  const newTask = (status: Status = 'todo') => {
    if (active)
      open({
        kind: 'task',
        boardId: active.id,
        title: '',
        description: '',
        status,
      });
  };

  async function refresh(boardId?: string) {
    await cache.invalidateQueries({ queryKey: ['local-boards'] });
    if (boardId)
      await cache.invalidateQueries({
        queryKey: ['local-board-tasks', boardId],
      });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editor || busy) return;
    setBusy(true);
    setError('');
    try {
      if (editor.kind === 'board') {
        const board = await api<Board>(
          editor.id ? `/${editor.id}` : '',
          editor.id ? 'PUT' : 'POST',
          { name: editor.name }
        );
        setSelectedId(board.id);
        await refresh();
      } else if (editor.kind === 'task') {
        await api(
          `/${editor.boardId}/tasks${editor.id ? `/${editor.id}` : ''}`,
          editor.id ? 'PUT' : 'POST',
          editor
        );
        await refresh(editor.boardId);
      } else {
        await api(editor.path, 'DELETE');
        if (editor.isBoard) setSelectedId(null);
        await refresh(editor.boardId);
      }
      setEditor(null);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Could not save changes. Please retry.'
      );
    } finally {
      setBusy(false);
    }
  }

  async function move(task: Task, status: Status) {
    if (busy || status === task.status) return;
    setBusy(true);
    setError('');
    try {
      await api(`/${task.board_id}/tasks/${task.id}`, 'PUT', {
        ...task,
        status,
      });
      await refresh(task.board_id);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Could not move task. Please retry.'
      );
    } finally {
      setBusy(false);
    }
  }

  function onDragEnd({ draggableId, destination }: DropResult) {
    const task = tasks.data?.find((item) => item.id === draggableId);
    const status = statuses.find(
      ([id]) => id === destination?.droppableId
    )?.[0];
    if (task && status) void move(task, status);
  }

  const loadError = boards.error || tasks.error;

  return (
    <div className="flex h-full min-h-0 flex-col bg-primary text-normal">
      <header className="flex flex-wrap items-center gap-base border-b border-border p-base">
        <div className="mr-auto">
          <h1 className="text-lg font-semibold text-high">
            Local kanban board
          </h1>
          <p className="text-sm text-low">
            Saved on this Mac · No account required
          </p>
        </div>
        {!!boards.data?.length && (
          <label className="flex items-center gap-half text-sm">
            Project
            <select
              className={input}
              aria-label="Local project"
              value={active?.id ?? ''}
              disabled={busy}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {boards.data.map((board) => (
                <option key={board.id} value={board.id}>
                  {board.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          className={button}
          disabled={busy}
          onClick={() => open({ kind: 'board', name: '' })}
        >
          New project
        </button>
        {active && (
          <>
            <button
              className={button}
              disabled={busy}
              onClick={() =>
                open({ kind: 'board', id: active.id, name: active.name })
              }
            >
              Rename project
            </button>
            <button
              className={button}
              disabled={busy}
              onClick={() =>
                open({
                  kind: 'delete',
                  path: `/${active.id}`,
                  label: `project “${active.name}” and all its tasks`,
                  boardId: active.id,
                  isBoard: true,
                })
              }
            >
              Delete project
            </button>
            <button
              className={`${button} bg-brand text-on-brand`}
              disabled={busy}
              onClick={() => newTask()}
            >
              New task
            </button>
          </>
        )}
      </header>
      {((error && !editor) || loadError) && (
        <div
          role="alert"
          className="flex items-center gap-base p-base text-error"
        >
          {loadError instanceof Error ? loadError.message : error}
          {loadError && (
            <button
              className={button}
              onClick={() => {
                void boards.refetch();
                if (active) void tasks.refetch();
              }}
            >
              Retry
            </button>
          )}
        </div>
      )}
      {boards.isLoading ? (
        <p className="p-double">Loading projects…</p>
      ) : !active ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-base p-double">
          <h2 className="text-xl text-high">Your local board is ready</h2>
          <p className="text-low">
            Create a project, add tasks, and move them through your workflow.
          </p>
          <button
            className={`${button} bg-brand text-on-brand`}
            onClick={() => open({ kind: 'board', name: '' })}
          >
            Create first project
          </button>
        </div>
      ) : tasks.isLoading ? (
        <p className="p-double">Loading tasks…</p>
      ) : (
        <div className="flex-1 overflow-auto p-base" aria-busy={busy}>
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="flex min-h-full gap-base">
              {statuses.map(([status, label]) => {
                const items =
                  tasks.data?.filter((task) => task.status === status) ?? [];
                return (
                  <section
                    key={status}
                    className="flex w-64 shrink-0 flex-col rounded-sm border border-border bg-secondary"
                    aria-label={label}
                  >
                    <div className="flex items-center gap-half border-b border-border p-base">
                      <h2 className="flex-1 font-semibold text-high">
                        {label} <span className="text-low">{items.length}</span>
                      </h2>
                      <button
                        className={button}
                        aria-label={`Add task to ${label}`}
                        disabled={busy}
                        onClick={() => newTask(status)}
                      >
                        +
                      </button>
                    </div>
                    <Droppable droppableId={status} isDropDisabled={busy}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`min-h-40 flex-1 space-y-half p-half ${snapshot.isDraggingOver ? 'bg-brand/10' : ''}`}
                        >
                          {items.map((task, index) => (
                            <Draggable
                              key={task.id}
                              draggableId={task.id}
                              index={index}
                              isDragDisabled={busy}
                            >
                              {(provided) => (
                                <article
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  className="space-y-half rounded-sm border border-border bg-primary p-base"
                                >
                                  <button
                                    className="w-full whitespace-pre-wrap break-words text-left font-medium text-high hover:underline"
                                    onClick={() =>
                                      open({
                                        kind: 'task',
                                        id: task.id,
                                        boardId: task.board_id,
                                        title: task.title,
                                        description: task.description,
                                        status: task.status,
                                      })
                                    }
                                  >
                                    {task.title}
                                  </button>
                                  {task.description && (
                                    <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm text-low">
                                      {task.description}
                                    </p>
                                  )}
                                  <select
                                    className={input}
                                    aria-label={`Status of ${task.title}`}
                                    value={task.status}
                                    disabled={busy}
                                    onChange={(event) => {
                                      const next = statuses.find(
                                        ([id]) => id === event.target.value
                                      )?.[0];
                                      if (next) void move(task, next);
                                    }}
                                  >
                                    {statuses.map(([id, name]) => (
                                      <option key={id} value={id}>
                                        {name}
                                      </option>
                                    ))}
                                  </select>
                                </article>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                          {!items.length && (
                            <p className="p-base text-sm text-low">No tasks</p>
                          )}
                        </div>
                      )}
                    </Droppable>
                  </section>
                );
              })}
            </div>
          </DragDropContext>
        </div>
      )}
      <Dialog
        open={!!editor}
        onOpenChange={(value) => {
          if (!value && !busy) {
            setEditor(null);
            setError('');
          }
        }}
      >
        {editor && (
          <DialogContent className="new-design max-h-[90vh] overflow-auto p-double">
            <DialogTitle className="text-lg text-high">
              {editor.kind === 'delete'
                ? 'Confirm deletion'
                : editor.kind === 'board'
                  ? editor.id
                    ? 'Rename project'
                    : 'New project'
                  : editor.id
                    ? 'Edit task'
                    : 'New task'}
            </DialogTitle>
            <DialogDescription className="mt-half text-sm text-low">
              {editor.kind === 'delete'
                ? `Delete ${editor.label}? This cannot be undone.`
                : 'Changes are saved locally on this Mac.'}
            </DialogDescription>
            <form
              className="mt-base space-y-base"
              onSubmit={(event) => void save(event)}
            >
              <fieldset disabled={busy} className="space-y-base">
                {editor.kind === 'board' && (
                  <label className="block space-y-half">
                    Project name
                    <input
                      className={input}
                      autoFocus
                      required
                      maxLength={200}
                      value={editor.name}
                      onChange={(event) =>
                        setEditor({ ...editor, name: event.target.value })
                      }
                    />
                  </label>
                )}
                {editor.kind === 'task' && (
                  <>
                    <label className="block space-y-half">
                      Task title
                      <input
                        className={input}
                        autoFocus
                        required
                        maxLength={500}
                        value={editor.title}
                        onChange={(event) =>
                          setEditor({ ...editor, title: event.target.value })
                        }
                      />
                    </label>
                    <label className="block space-y-half">
                      Description
                      <textarea
                        className={input}
                        rows={6}
                        maxLength={100000}
                        value={editor.description}
                        onChange={(event) =>
                          setEditor({
                            ...editor,
                            description: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="block space-y-half">
                      Status
                      <select
                        className={input}
                        value={editor.status}
                        onChange={(event) => {
                          const status = statuses.find(
                            ([id]) => id === event.target.value
                          )?.[0];
                          if (status) setEditor({ ...editor, status });
                        }}
                      >
                        {statuses.map(([id, name]) => (
                          <option key={id} value={id}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                {error && (
                  <p role="alert" className="text-error">
                    {error}
                  </p>
                )}
                <div className="flex items-center gap-half">
                  {editor.kind === 'task' && editor.id && (
                    <button
                      className={`${button} mr-auto text-error`}
                      type="button"
                      onClick={() =>
                        open({
                          kind: 'delete',
                          path: `/${editor.boardId}/tasks/${editor.id}`,
                          label: `task “${editor.title}”`,
                          boardId: editor.boardId,
                          isBoard: false,
                        })
                      }
                    >
                      Delete task
                    </button>
                  )}
                  <button
                    className={`${button} ml-auto`}
                    type="button"
                    onClick={() => {
                      setEditor(null);
                      setError('');
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    className={`${button} ${editor.kind === 'delete' ? 'text-error' : 'bg-brand text-on-brand'}`}
                    type="submit"
                  >
                    {busy
                      ? 'Saving…'
                      : editor.kind === 'delete'
                        ? 'Delete'
                        : 'Save'}
                  </button>
                </div>
              </fieldset>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
