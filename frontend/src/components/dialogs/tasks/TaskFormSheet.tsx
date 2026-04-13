import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import {
  ArrowLeft,
  X,
  Image as ImageIcon,
  FileText,
  Plus,
  Trash2,
} from 'lucide-react';
import { useForm, useStore } from '@tanstack/react-form';
import { useDropzone } from 'react-dropzone';

import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import {
  usePendingVariables,
  type PendingVariable,
} from '@/hooks/usePendingVariables';
import { defineModal } from '@/lib/modals';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label as FormLabel } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FileSearchTextarea } from '@/components/ui/file-search-textarea';
import {
  ImageUploadSection,
  type ImageUploadSectionHandle,
} from '@/components/ui/image-upload-section';
import BranchSelector from '@/components/tasks/BranchSelector';
import { ExecutorProfileSelector } from '@/components/settings';
import { VariableEditor } from '@/components/variables';
import { useUserSystem } from '@/components/ConfigProvider';
import {
  useProjectBranches,
  useTaskImages,
  useImageUpload,
  useTaskMutations,
  useTaskAttempts,
} from '@/hooks';
import { useTaskLabels } from '@/hooks/useTaskLabels';
import { LabelSelect } from '@/components/labels';
import {
  TemplatePicker,
  Template as PickerTemplate,
} from '@/components/tasks/TemplatePicker';
import { labelsApi, taskVariablesApi, templatesApi } from '@/lib/api';
import { insertImageMarkdownAtPosition } from '@/utils/markdownImages';
import type {
  Task,
  TaskStatus,
  ExecutorProfileId,
  ImageResponse,
  Label,
} from 'shared/types';

/**
 * Props for TaskFormSheet component
 * These match TaskFormDialogProps for compatibility
 */
export type TaskFormSheetProps =
  | { mode: 'create'; projectId: string }
  | { mode: 'edit'; projectId: string; task: Task }
  | { mode: 'duplicate'; projectId: string; initialTask: Task }
  | {
      mode: 'subtask';
      projectId: string;
      parentTaskId: string;
      initialBaseBranch?: string;
    };

type TaskFormValues = {
  title: string;
  description: string;
  status: TaskStatus;
  executorProfileId: ExecutorProfileId | null;
  branch: string;
  autoStart: boolean;
  useParentWorktree: boolean;
};

const DRAG_CLOSE_THRESHOLD = 100;

/**
 * TaskFormSheet - Full-screen mobile / Modal desktop task form
 *
 * A responsive task creation/editing form that displays as:
 * - Full-screen sheet on mobile (< 640px) with swipe-to-dismiss
 * - Centered modal on tablet/desktop (>= 640px)
 *
 * Features:
 * - Full-screen on mobile with sticky footer toolbar
 * - Support for create, edit, duplicate, and subtask modes
 * - Parent worktree reuse option for subtasks
 * - Variable buffering for new tasks (via usePendingVariables)
 * - Image attachment with drag-and-drop
 * - Template insertion support
 */
const TaskFormSheetImpl = NiceModal.create<TaskFormSheetProps>((props) => {
  const { mode, projectId } = props;
  const editMode = mode === 'edit';
  const modal = useModal();
  // Use 768px breakpoint for mobile (matches tablet breakpoint from Session 1)
  const isMobile = useMediaQuery('(max-width: 767px)');
  const { t } = useTranslation(['tasks', 'common']);
  const { createTask, createAndStart, updateTask } =
    useTaskMutations(projectId);
  const { system, profiles, loading: userSystemLoading } = useUserSystem();
  const { upload, deleteImage } = useImageUpload();

  // Pending variables for new task creation
  const pendingVariables = usePendingVariables();

  // Variable editor state
  const [showVariableEditor, setShowVariableEditor] = useState(false);
  const [editingVariable, setEditingVariable] =
    useState<PendingVariable | null>(null);
  const [newVarName, setNewVarName] = useState('');
  const [newVarValue, setNewVarValue] = useState('');

  // Local UI state
  const [images, setImages] = useState<ImageResponse[]>([]);
  const [newlyUploadedImageIds, setNewlyUploadedImageIds] = useState<string[]>(
    []
  );
  const [showDiscardWarning, setShowDiscardWarning] = useState(false);
  const imageUploadRef = useRef<ImageUploadSectionHandle>(null);
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const forceCreateOnlyRef = useRef(false);
  const insertPositionRef = useRef<number>(0);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Template picker state
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [customTemplates, setCustomTemplates] = useState<PickerTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [templateRetryCount, setTemplateRetryCount] = useState(0);

  const { data: branches, isLoading: branchesLoading } =
    useProjectBranches(projectId);
  const { data: taskImages } = useTaskImages(
    editMode ? (props as { task: Task }).task.id : undefined
  );

  // Parent task attempts - for "use parent worktree" option in subtask mode
  const parentTaskId =
    mode === 'subtask'
      ? (props as { parentTaskId: string }).parentTaskId
      : undefined;
  const { data: parentAttempts = [] } = useTaskAttempts(parentTaskId, {
    enabled: mode === 'subtask',
  });

  // Determine if parent worktree is available
  const parentWorktreeAvailable = useMemo(() => {
    if (parentAttempts.length === 0) return false;
    const latest = parentAttempts[0];
    if (!latest.container_ref) return false;
    if (latest.worktree_deleted) return false;
    return true;
  }, [parentAttempts]);

  // Labels management
  const taskId = editMode ? (props as { task: Task }).task.id : undefined;
  const { data: taskLabels } = useTaskLabels(taskId, editMode);
  const [selectedLabel, setSelectedLabel] = useState<Label | null>(null);

  // Sync labels from server
  useEffect(() => {
    if (taskLabels && taskLabels.length > 0) {
      setSelectedLabel(taskLabels[0]);
    }
  }, [taskLabels]);

  // Get default form values based on mode
  const defaultValues = useMemo((): TaskFormValues => {
    const baseProfile = system.config?.executor_profile || null;

    const defaultBranch = (() => {
      if (!branches?.length) return '';
      if (
        mode === 'subtask' &&
        'initialBaseBranch' in props &&
        branches.some((b) => b.name === props.initialBaseBranch)
      ) {
        return props.initialBaseBranch || '';
      }
      const currentBranch = branches.find((b) => b.is_current);
      return currentBranch?.name || branches[0]?.name || '';
    })();

    switch (mode) {
      case 'edit':
        return {
          title: (props as { task: Task }).task.title,
          description: (props as { task: Task }).task.description || '',
          status: (props as { task: Task }).task.status,
          executorProfileId: baseProfile,
          branch: defaultBranch || '',
          autoStart: false,
          useParentWorktree: false,
        };

      case 'duplicate':
        return {
          title: (props as { initialTask: Task }).initialTask.title,
          description:
            (props as { initialTask: Task }).initialTask.description || '',
          status: 'todo',
          executorProfileId: baseProfile,
          branch: defaultBranch || '',
          autoStart: true,
          useParentWorktree: false,
        };

      case 'subtask':
        return {
          title: '',
          description: '',
          status: 'todo',
          executorProfileId: baseProfile,
          branch: defaultBranch || '',
          autoStart: true,
          useParentWorktree: parentWorktreeAvailable,
        };

      case 'create':
      default:
        return {
          title: '',
          description: '',
          status: 'todo',
          executorProfileId: baseProfile,
          branch: defaultBranch || '',
          autoStart: true,
          useParentWorktree: false,
        };
    }
  }, [
    mode,
    props,
    system.config?.executor_profile,
    branches,
    parentWorktreeAvailable,
  ]);

  // Form submission handler
  const handleSubmit = async ({ value }: { value: TaskFormValues }) => {
    if (editMode) {
      const task = (props as { task: Task }).task;
      await updateTask.mutateAsync({
        taskId: task.id,
        data: {
          title: value.title,
          description: value.description,
          status: value.status,
          parent_task_id: null,
          image_ids: images.length > 0 ? images.map((img) => img.id) : null,
        },
      });
      modal.remove();
    } else {
      const imageIds =
        newlyUploadedImageIds.length > 0 ? newlyUploadedImageIds : null;
      const task = {
        project_id: projectId,
        title: value.title,
        description: value.description,
        status: null,
        parent_task_id:
          mode === 'subtask'
            ? (props as { parentTaskId: string }).parentTaskId
            : null,
        image_ids: imageIds,
        shared_task_id: null,
      };
      const shouldAutoStart = value.autoStart && !forceCreateOnlyRef.current;

      // Helper to set label and variables after task creation
      const postCreateActions = async (createdTaskId: string) => {
        // Set label if selected
        if (selectedLabel) {
          try {
            await labelsApi.setTaskLabels(createdTaskId, {
              label_ids: [selectedLabel.id],
            });
          } catch (err) {
            console.error('Failed to set label on new task:', err);
          }
        }

        // Create pending variables
        if (pendingVariables.hasItems()) {
          const varsToCreate = pendingVariables.getAll();
          for (const variable of varsToCreate) {
            try {
              await taskVariablesApi.create(createdTaskId, variable);
            } catch (err) {
              console.error('Failed to create variable:', variable.name, err);
            }
          }
          pendingVariables.clear();
        }
      };

      if (shouldAutoStart) {
        await createAndStart.mutateAsync(
          {
            task,
            executor_profile_id: value.executorProfileId!,
            base_branch: value.branch,
            use_parent_worktree:
              mode === 'subtask' && value.useParentWorktree ? true : null,
          },
          {
            onSuccess: async (result) => {
              await postCreateActions(result.id);
              modal.remove();
            },
          }
        );
      } else {
        await createTask.mutateAsync(task, {
          onSuccess: async (createdTask) => {
            await postCreateActions(createdTask.id);
            modal.remove();
          },
        });
      }
    }
  };

  const validator = (value: TaskFormValues): string | undefined => {
    if (!value.title.trim().length) return 'need title';
    if (
      value.autoStart &&
      !forceCreateOnlyRef.current &&
      (!value.executorProfileId || !value.branch)
    ) {
      return 'need executor profile or branch';
    }
  };

  const form = useForm({
    defaultValues,
    onSubmit: handleSubmit,
    validators: {
      onMount: ({ value }) => validator(value),
      onChange: ({ value }) => validator(value),
    },
  });

  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
  const isDirty = useStore(form.store, (state) => state.isDirty);

  // Load images for edit mode
  useEffect(() => {
    if (!taskImages) return;
    setImages(taskImages);
  }, [taskImages]);

  const onDrop = useCallback((files: File[]) => {
    if (imageUploadRef.current) {
      imageUploadRef.current.addFiles(files);
    } else {
      setPendingFiles(files);
    }
  }, []);

  const handlePasteFiles = useCallback(
    (files: File[], cursorPosition: number) => {
      insertPositionRef.current = cursorPosition;
      onDrop(files);
    },
    [onDrop]
  );

  const handleSelectionChange = useCallback((cursorPosition: number) => {
    insertPositionRef.current = cursorPosition;
  }, []);

  const {
    getRootProps,
    getInputProps,
    isDragActive,
    open: dropzoneOpen,
  } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    disabled: isSubmitting,
    noClick: true,
    noKeyboard: true,
  });

  // Apply pending files when ImageUploadSection becomes available
  useEffect(() => {
    if (pendingFiles && imageUploadRef.current) {
      imageUploadRef.current.addFiles(pendingFiles);
      setPendingFiles(null);
    }
  }, [pendingFiles]);

  // Image upload callback
  const handleImageUploaded = useCallback(
    (img: ImageResponse) => {
      form.setFieldValue('description', (prev) => {
        const { newText, newCursorPosition } = insertImageMarkdownAtPosition(
          prev,
          img,
          insertPositionRef.current
        );
        insertPositionRef.current = newCursorPosition;
        return newText;
      });
      setImages((prev) => [...prev, img]);
      setNewlyUploadedImageIds((prev) => [...prev, img.id]);
    },
    [form]
  );

  // Label change handler
  const handleLabelChange = useCallback(
    async (newLabel: Label | null) => {
      setSelectedLabel(newLabel);
      if (editMode && taskId) {
        try {
          await labelsApi.setTaskLabels(taskId, {
            label_ids: newLabel ? [newLabel.id] : [],
          });
        } catch (err) {
          console.error('Failed to update task label:', err);
          if (taskLabels && taskLabels.length > 0) {
            setSelectedLabel(taskLabels[0]);
          } else {
            setSelectedLabel(null);
          }
        }
      }
    },
    [editMode, taskId, taskLabels]
  );

  // Unsaved changes detection
  const hasUnsavedChanges = useCallback(() => {
    if (isDirty) return true;
    if (newlyUploadedImageIds.length > 0) return true;
    if (images.length > 0 && !editMode) return true;
    if (pendingVariables.hasItems()) return true;
    return false;
  }, [isDirty, newlyUploadedImageIds, images, editMode, pendingVariables]);

  // Handle close
  const handleClose = useCallback(() => {
    if (hasUnsavedChanges()) {
      setShowDiscardWarning(true);
    } else {
      pendingVariables.clear();
      modal.remove();
    }
  }, [hasUnsavedChanges, modal, pendingVariables]);

  // Handle discard
  const handleDiscardChanges = useCallback(() => {
    form.reset();
    setImages([]);
    setNewlyUploadedImageIds([]);
    pendingVariables.clear();
    setShowDiscardWarning(false);
    modal.remove();
  }, [form, modal, pendingVariables]);

  // Handle drag end for swipe-to-dismiss
  const handleDragEnd = useCallback(
    (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      if (info.offset.y > DRAG_CLOSE_THRESHOLD || info.velocity.y > 500) {
        handleClose();
      }
    },
    [handleClose]
  );

  // Escape key handler
  useEffect(() => {
    if (!modal.visible) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [modal.visible, handleClose]);

  // Prevent body scroll when open on mobile
  useEffect(() => {
    if (!modal.visible || !isMobile) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [modal.visible, isMobile]);

  // Fetch templates when picker opens
  useEffect(() => {
    if (!showTemplatePicker) return;

    let cancelled = false;
    setLoadingTemplates(true);
    setTemplateError(null);

    templatesApi
      .list()
      .then((templates) => {
        if (cancelled) return;
        setCustomTemplates(
          templates.map((tmpl) => ({
            id: tmpl.id,
            name: tmpl.template_name,
            description: `@${tmpl.template_name}`,
            content: tmpl.content,
          }))
        );
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load templates:', err);
        setTemplateError(
          t('templatePicker.loadError', 'Failed to load templates')
        );
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingTemplates(false);
      });

    return () => {
      cancelled = true;
    };
  }, [showTemplatePicker, t, templateRetryCount]);

  // Template retry handler
  const handleRetryTemplates = useCallback(() => {
    setTemplateRetryCount((c) => c + 1);
  }, []);

  // Template selection handler
  const handleTemplateSelect = useCallback(
    (template: PickerTemplate) => {
      const currentDescription = form.getFieldValue('description') || '';
      const cursorPos = insertPositionRef.current ?? currentDescription.length;
      const newDescription =
        currentDescription.slice(0, cursorPos) +
        template.content +
        currentDescription.slice(cursorPos);
      form.setFieldValue('description', newDescription);
    },
    [form]
  );

  // Add variable handler
  const handleAddVariable = useCallback(() => {
    if (!newVarName.trim()) return;
    if (pendingVariables.nameExists(newVarName)) {
      // Variable already exists
      return;
    }
    pendingVariables.addVariable({
      name: newVarName.toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
      value: newVarValue,
    });
    setNewVarName('');
    setNewVarValue('');
    setShowVariableEditor(false);
  }, [newVarName, newVarValue, pendingVariables]);

  // Update variable handler
  const handleUpdateVariable = useCallback(() => {
    if (!editingVariable || !newVarName.trim()) return;
    pendingVariables.updateVariable(editingVariable.id, {
      name: newVarName.toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
      value: newVarValue,
    });
    setEditingVariable(null);
    setNewVarName('');
    setNewVarValue('');
    setShowVariableEditor(false);
  }, [editingVariable, newVarName, newVarValue, pendingVariables]);

  // Get header title based on mode
  const headerTitle = useMemo(() => {
    switch (mode) {
      case 'edit':
        return t('taskFormSheet.editTask', 'Edit Task');
      case 'duplicate':
        return t('taskFormSheet.duplicateTask', 'Duplicate Task');
      case 'subtask':
        return t('taskFormSheet.createSubtask', 'Create Subtask');
      case 'create':
      default:
        return t('taskFormSheet.createTask', 'Create Task');
    }
  }, [mode, t]);

  const loading = branchesLoading || userSystemLoading;
  if (loading || !modal.visible) return null;

  // Render the form content
  const formContent = (
    <div {...getRootProps()} className="flex flex-col h-full min-h-0 relative">
      <input {...getInputProps()} />

      {/* Drag overlay */}
      {isDragActive && (
        <div className="absolute inset-0 z-50 bg-primary/95 border-2 border-dashed border-primary-foreground/50 rounded-lg flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <ImageIcon className="h-12 w-12 mx-auto mb-2 text-primary-foreground" />
            <p className="text-lg font-medium text-primary-foreground">
              {t('taskFormDialog.dropImagesHere', 'Drop images here')}
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex-none flex items-center gap-3 px-4 py-3 border-b">
        {isMobile ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            aria-label={t('common:back', 'Back')}
            className="h-12 w-12 -ml-2"
          >
            <ArrowLeft className="h-6 w-6" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            aria-label={t('common:close', 'Close')}
            className="h-10 w-10 absolute right-3 top-3"
          >
            <X className="h-5 w-5" />
          </Button>
        )}
        <h2 className="text-lg font-semibold">{headerTitle}</h2>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto overscroll-contain min-h-0">
        <div className="px-4 py-4 space-y-4">
          {/* Title */}
          <div className="space-y-1">
            <FormLabel
              htmlFor="task-title"
              className="text-xs font-medium uppercase text-muted-foreground"
            >
              {t('taskFormSheet.title', 'Title')}
            </FormLabel>
            <form.Field name="title">
              {(field) => (
                <Input
                  id="task-title"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder={t(
                    'taskFormDialog.titlePlaceholder',
                    'Task title'
                  )}
                  className="text-base"
                  disabled={isSubmitting}
                  autoFocus
                />
              )}
            </form.Field>
          </div>

          {/* Description */}
          <div className="space-y-1">
            <FormLabel
              htmlFor="task-description"
              className="text-xs font-medium uppercase text-muted-foreground"
            >
              {t('taskFormSheet.description', 'Description')}
            </FormLabel>
            <form.Field name="description">
              {(field) => (
                <FileSearchTextarea
                  value={field.state.value}
                  onChange={(desc) => field.handleChange(desc)}
                  rows={isMobile ? 4 : 5}
                  maxRows={isMobile ? 20 : 40}
                  placeholder={t(
                    'taskFormDialog.descriptionPlaceholder',
                    'Add details...'
                  )}
                  className={cn(
                    'resize-none',
                    isMobile ? 'text-base' : 'text-sm'
                  )}
                  disabled={isSubmitting}
                  projectId={projectId}
                  onPasteFiles={handlePasteFiles}
                  onSelectionChange={handleSelectionChange}
                  disableScroll={true}
                />
              )}
            </form.Field>
          </div>

          {/* Images */}
          <ImageUploadSection
            ref={imageUploadRef}
            images={images}
            onImagesChange={setImages}
            onUpload={upload}
            onDelete={deleteImage}
            onImageUploaded={handleImageUploaded}
            disabled={isSubmitting}
            collapsible={true}
            defaultExpanded={images.length > 0}
            hideDropZone={true}
          />

          {/* Variables Section (Create mode - pending variables) */}
          {!editMode && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <FormLabel className="text-xs font-medium uppercase text-muted-foreground">
                  {t('taskFormSheet.variables', 'Variables')}
                </FormLabel>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowVariableEditor(true);
                    setEditingVariable(null);
                    setNewVarName('');
                    setNewVarValue('');
                  }}
                  aria-label={t('taskFormSheet.addVariable', 'Add variable')}
                  className={cn('h-9 px-3', isMobile && 'h-11 px-4')}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {/* Pending variables list */}
              {pendingVariables.variables.length > 0 && (
                <div className="space-y-1 rounded-md border p-2">
                  {pendingVariables.variables.map((variable) => (
                    <div
                      key={variable.id}
                      className="flex items-center justify-between py-1 px-2 rounded hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-2 font-mono text-sm">
                        <span className="text-muted-foreground">$</span>
                        <span>{variable.name}</span>
                        <span className="text-muted-foreground">=</span>
                        <span className="text-muted-foreground truncate max-w-[120px]">
                          {variable.value || '(empty)'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn('h-8 w-8', isMobile && 'h-10 w-10')}
                          onClick={() => {
                            setEditingVariable(variable);
                            setNewVarName(variable.name);
                            setNewVarValue(variable.value);
                            setShowVariableEditor(true);
                          }}
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            'h-8 w-8 text-destructive',
                            isMobile && 'h-10 w-10'
                          )}
                          onClick={() =>
                            pendingVariables.removeVariable(variable.id)
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Variable editor inline form */}
              {showVariableEditor && (
                <div className="space-y-2 p-3 rounded-md border bg-muted/30">
                  <Input
                    placeholder={t(
                      'taskFormSheet.variableName',
                      'Variable name (e.g., API_KEY)'
                    )}
                    value={newVarName}
                    onChange={(e) =>
                      setNewVarName(e.target.value.toUpperCase())
                    }
                    className={cn(
                      'font-mono',
                      isMobile ? 'text-base' : 'text-sm'
                    )}
                  />
                  <Input
                    placeholder={t('taskFormSheet.variableValue', 'Value')}
                    value={newVarValue}
                    onChange={(e) => setNewVarValue(e.target.value)}
                    className={cn(
                      'font-mono',
                      isMobile ? 'text-base' : 'text-sm'
                    )}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowVariableEditor(false);
                        setEditingVariable(null);
                        setNewVarName('');
                        setNewVarValue('');
                      }}
                    >
                      {t('common:cancel', 'Cancel')}
                    </Button>
                    <Button
                      size="sm"
                      onClick={
                        editingVariable
                          ? handleUpdateVariable
                          : handleAddVariable
                      }
                      disabled={!newVarName.trim()}
                    >
                      {editingVariable
                        ? t('common:save', 'Save')
                        : t('common:add', 'Add')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Variables Editor - edit mode only */}
          {editMode && (
            <div className="pt-2">
              <VariableEditor
                taskId={(props as { task: Task }).task.id}
                disabled={isSubmitting}
                showInherited={true}
                compact={true}
              />
            </div>
          )}

          {/* Edit mode status */}
          {editMode && (
            <form.Field name="status">
              {(field) => (
                <div className="space-y-1">
                  <FormLabel
                    htmlFor="task-status"
                    className="text-xs font-medium uppercase text-muted-foreground"
                  >
                    {t('taskFormDialog.statusLabel', 'Status')}
                  </FormLabel>
                  <Select
                    value={field.state.value}
                    onValueChange={(value) =>
                      field.handleChange(value as TaskStatus)
                    }
                    disabled={isSubmitting}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todo">
                        {t('taskFormDialog.statusOptions.todo', 'To Do')}
                      </SelectItem>
                      <SelectItem value="inprogress">
                        {t(
                          'taskFormDialog.statusOptions.inprogress',
                          'In Progress'
                        )}
                      </SelectItem>
                      <SelectItem value="inreview">
                        {t(
                          'taskFormDialog.statusOptions.inreview',
                          'In Review'
                        )}
                      </SelectItem>
                      <SelectItem value="done">
                        {t('taskFormDialog.statusOptions.done', 'Done')}
                      </SelectItem>
                      <SelectItem value="cancelled">
                        {t(
                          'taskFormDialog.statusOptions.cancelled',
                          'Cancelled'
                        )}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </form.Field>
          )}

          {/* Execution Options (Create mode) */}
          {!editMode && (
            <form.Field name="autoStart" mode="array">
              {(autoStartField) => (
                <div
                  className={cn(
                    'space-y-3 py-3 transition-opacity duration-200',
                    autoStartField.state.value ? 'opacity-100' : 'opacity-50'
                  )}
                >
                  <FormLabel className="text-xs font-medium uppercase text-muted-foreground">
                    {t('taskFormSheet.execution', 'Execution')}
                  </FormLabel>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <form.Field name="executorProfileId">
                      {(field) => (
                        <ExecutorProfileSelector
                          profiles={profiles}
                          selectedProfile={field.state.value}
                          onProfileSelect={(profile) =>
                            field.handleChange(profile)
                          }
                          disabled={isSubmitting || !autoStartField.state.value}
                          showLabel={false}
                          className="flex items-center gap-2 flex-row flex-1 min-w-0"
                          itemClassName="flex-1 min-w-0"
                        />
                      )}
                    </form.Field>
                    <form.Field name="branch">
                      {(field) => (
                        <form.Field name="useParentWorktree">
                          {(parentWorktreeField) => (
                            <div
                              data-testid="branch-selector"
                              data-disabled={
                                mode === 'subtask' &&
                                parentWorktreeField.state.value
                              }
                            >
                              <BranchSelector
                                branches={branches ?? []}
                                selectedBranch={field.state.value}
                                onBranchSelect={(branch) =>
                                  field.handleChange(branch)
                                }
                                placeholder="Branch"
                                className={cn(
                                  'h-9 flex-1 min-w-0 text-xs',
                                  (isSubmitting ||
                                    (mode === 'subtask' &&
                                      parentWorktreeField.state.value)) &&
                                    'opacity-50 cursor-not-allowed pointer-events-none'
                                )}
                              />
                            </div>
                          )}
                        </form.Field>
                      )}
                    </form.Field>
                  </div>

                  {/* Use parent worktree checkbox - subtask mode only */}
                  {mode === 'subtask' && (
                    <form.Field name="useParentWorktree">
                      {(field) => (
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="use-parent-worktree"
                            checked={field.state.value}
                            onCheckedChange={(checked) =>
                              field.handleChange(checked === true)
                            }
                            disabled={
                              isSubmitting ||
                              !autoStartField.state.value ||
                              !parentWorktreeAvailable
                            }
                            aria-label={t(
                              'taskFormDialog.useParentWorktree',
                              'Use parent worktree'
                            )}
                          />
                          <FormLabel
                            htmlFor="use-parent-worktree"
                            className={cn(
                              'text-sm cursor-pointer',
                              !parentWorktreeAvailable &&
                                'text-muted-foreground'
                            )}
                          >
                            {t(
                              'taskFormDialog.useParentWorktree',
                              'Use parent worktree'
                            )}
                          </FormLabel>
                        </div>
                      )}
                    </form.Field>
                  )}
                </div>
              )}
            </form.Field>
          )}
        </div>
      </div>

      {/* Sticky Footer Toolbar */}
      <div
        data-testid="form-footer"
        className="sticky bottom-0 flex-none border-t bg-background px-4 py-3 space-y-3"
      >
        {/* Tool buttons */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            {/* Attach Image */}
            <Button
              variant="outline"
              size="icon"
              onClick={dropzoneOpen}
              className={cn('h-11 w-11', isMobile && 'h-12 w-12')}
              aria-label={t('taskFormDialog.attachImage', 'Attach image')}
            >
              <ImageIcon className="h-5 w-5" />
            </Button>

            {/* Insert Template */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowTemplatePicker(true)}
              className={cn('h-11 w-11', isMobile && 'h-12 w-12')}
              aria-label={t('taskFormSheet.insertTemplate', 'Insert template')}
            >
              <FileText className="h-5 w-5" />
            </Button>
          </div>

          {/* Label selector + Auto-start toggle */}
          <div className="flex items-center gap-3">
            <LabelSelect
              projectId={projectId}
              selectedLabel={selectedLabel}
              onLabelChange={handleLabelChange}
              disabled={isSubmitting}
            />

            {!editMode && (
              <form.Field name="autoStart">
                {(field) => (
                  <div className="flex items-center gap-2">
                    <Switch
                      id="autostart-switch"
                      checked={field.state.value}
                      onCheckedChange={(checked) => field.handleChange(checked)}
                      disabled={isSubmitting}
                      className="data-[state=checked]:bg-gray-900 dark:data-[state=checked]:bg-gray-100"
                      aria-label={t('taskFormDialog.startLabel', 'Start')}
                    />
                    <FormLabel
                      htmlFor="autostart-switch"
                      className="text-sm cursor-pointer hidden sm:inline"
                    >
                      {t('taskFormDialog.startLabel', 'Start')}
                    </FormLabel>
                  </div>
                )}
              </form.Field>
            )}
          </div>
        </div>

        {/* Primary action button */}
        <form.Subscribe
          selector={(state) => ({
            canSubmit: state.canSubmit,
            isSubmitting: state.isSubmitting,
            values: state.values,
          })}
        >
          {({ canSubmit, isSubmitting, values }) => {
            const buttonText = editMode
              ? isSubmitting
                ? t('taskFormDialog.updating', 'Updating...')
                : t('taskFormDialog.updateTask', 'Update Task')
              : isSubmitting
                ? values.autoStart
                  ? t('taskFormDialog.starting', 'Starting...')
                  : t('taskFormDialog.creating', 'Creating...')
                : values.autoStart
                  ? t('taskFormSheet.createAndStart', 'Create & Start')
                  : t('taskFormDialog.create', 'Create');

            return (
              <Button
                onClick={(e) => form.handleSubmit(e)}
                disabled={!canSubmit}
                className={cn('w-full h-11 text-base', isMobile && 'h-12')}
              >
                {buttonText}
              </Button>
            );
          }}
        </form.Subscribe>
      </div>

      {/* Template Picker */}
      <TemplatePicker
        open={showTemplatePicker}
        onOpenChange={setShowTemplatePicker}
        onSelect={handleTemplateSelect}
        customTemplates={customTemplates}
        showDefaults={true}
        loading={loadingTemplates}
        error={templateError}
        onRetry={handleRetryTemplates}
      />
    </div>
  );

  // Render based on device type
  if (isMobile) {
    // Full-screen sheet on mobile
    return (
      <>
        <AnimatePresence>
          {modal.visible && (
            <>
              {/* Backdrop */}
              <motion.div
                className="fixed inset-0 z-[9998] bg-black/50"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={handleClose}
              />

              {/* Full-screen sheet */}
              <motion.div
                ref={sheetRef}
                data-testid="task-form-sheet"
                className={cn(
                  'fixed inset-0 z-[9999] bg-background flex flex-col',
                  'safe-area-inset-top safe-area-inset-bottom'
                )}
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                drag="y"
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.2 }}
                onDragEnd={handleDragEnd}
              >
                {formContent}
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Discard warning dialog */}
        {showDiscardWarning && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-black/50"
              onClick={() => setShowDiscardWarning(false)}
            />
            <div className="relative z-[10000] w-full max-w-sm bg-background rounded-lg p-6 shadow-lg space-y-4">
              <h3 className="text-lg font-semibold">
                {t('taskFormDialog.discardDialog.title', 'Discard changes?')}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t(
                  'taskFormDialog.discardDialog.description',
                  'You have unsaved changes. Are you sure you want to discard them?'
                )}
              </p>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setShowDiscardWarning(false)}
                >
                  {t(
                    'taskFormDialog.discardDialog.continueEditing',
                    'Continue Editing'
                  )}
                </Button>
                <Button variant="destructive" onClick={handleDiscardChanges}>
                  {t('taskFormDialog.discardDialog.discardChanges', 'Discard')}
                </Button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // Modal on tablet/desktop
  return (
    <>
      <AnimatePresence>
        {modal.visible && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 z-[9998] bg-black/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleClose}
            />

            {/* Flex container for centering */}
            <motion.div
              className="fixed inset-0 z-[9999] flex items-start justify-center pt-[5vh] pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {/* Top-anchored modal */}
              <motion.div
                data-testid="task-form-sheet"
                className={cn(
                  'bg-background rounded-lg shadow-xl flex flex-col overflow-hidden pointer-events-auto',
                  'w-[min(95vw,600px)] max-h-[90vh]'
                )}
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.95 }}
                transition={{ duration: 0.2 }}
              >
                {formContent}
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Discard warning dialog */}
      {showDiscardWarning && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setShowDiscardWarning(false)}
          />
          <div className="relative z-[10000] w-full max-w-sm bg-background rounded-lg p-6 shadow-lg space-y-4">
            <h3 className="text-lg font-semibold">
              {t('taskFormDialog.discardDialog.title', 'Discard changes?')}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t(
                'taskFormDialog.discardDialog.description',
                'You have unsaved changes. Are you sure you want to discard them?'
              )}
            </p>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowDiscardWarning(false)}
              >
                {t(
                  'taskFormDialog.discardDialog.continueEditing',
                  'Continue Editing'
                )}
              </Button>
              <Button variant="destructive" onClick={handleDiscardChanges}>
                {t('taskFormDialog.discardDialog.discardChanges', 'Discard')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

/**
 * TaskFormSheet - Modal dialog for task creation/editing
 * Renders as full-screen sheet on mobile (<768px) or centered modal on tablet/desktop
 */
export const TaskFormSheet = defineModal<TaskFormSheetProps, void>(
  TaskFormSheetImpl
);

export default TaskFormSheet;
