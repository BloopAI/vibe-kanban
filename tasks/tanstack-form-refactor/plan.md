# TaskFormDialog TanStack Form Refactor

## Overview

Refactor `TaskFormDialog.tsx` to use TanStack Form (`@tanstack/react-form`) for managing form state instead of the current `useReducer` approach. This will improve type safety, reduce boilerplate, and provide better validation patterns.

## Goals

- Replace reducer-based state management with TanStack Form for core task data
- Improve type safety and validation
- Maintain all existing functionality (multiple modes, image uploads, keyboard shortcuts, etc.)
- Simplify code while keeping it maintainable
- Incremental migration path to minimize risk

## State Ownership Split

### TanStack Form State (Core Task Data)

These values are persisted to the task record or used to create/start task attempts:

```typescript
type TaskFormValues = {
  title: string;
  description: string;
  status: TaskStatus; // only used/shown in edit mode
  executorProfileId: ExecutorProfileId | null;
  branch: string;
};
```

### Local React State (UI-Only)

These flags control dialog behavior and presentation but aren't part of the task data model:

```typescript
const [autoStart, setAutoStart] = useState(true);
const [showImageUpload, setShowImageUpload] = useState(false);
const [images, setImages] = useState<ImageResponse[]>([]);
const [newlyUploadedImageIds, setNewlyUploadedImageIds] = useState<string[]>([]);
const [showDiscardWarning, setShowDiscardWarning] = useState(false);
const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
```

**Note:** `isSubmitting` is removed from local state and accessed via `form.state.isSubmitting`

## Type Definitions

```typescript
type TaskFormValues = {
  title: string;
  description: string;
  status: TaskStatus;
  executorProfileId: ExecutorProfileId | null;
  branch: string;
};
```

## Default Values by Mode

```typescript
const getDefaultValues = (): TaskFormValues => {
  const baseProfile = system.config?.executor_profile || null;
  
  switch (mode) {
    case 'edit':
      return {
        title: props.task.title,
        description: props.task.description || '',
        status: props.task.status,
        executorProfileId: baseProfile,
        branch: defaultBranch || '',
      };
      
    case 'duplicate':
      return {
        title: props.initialTask.title,
        description: props.initialTask.description || '',
        status: 'todo',
        executorProfileId: baseProfile,
        branch: defaultBranch || '',
      };
      
    case 'subtask':
    case 'create':
    default:
      return {
        title: '',
        description: '',
        status: 'todo',
        executorProfileId: baseProfile,
        branch: defaultBranch || '',
      };
  }
};
```

## Validation Strategy

### Field-Level Validators

#### Title (Required)
```typescript
<form.Field
  name="title"
  validators={{
    onChange: ({ value }) => 
      value.trim() ? undefined : t('taskFormDialog.titleRequired')
  }}
>
  {(field) => (/* ... */)}
</form.Field>
```

#### Executor Profile (Conditional - only when autoStart is true)
```typescript
<form.Field
  name="executorProfileId"
  validators={{
    onChange: ({ value }) => {
      if (mode !== 'edit' && autoStart && !value) {
        return t('taskFormDialog.profileRequired');
      }
      return undefined;
    }
  }}
>
  {(field) => (/* ... */)}
</form.Field>
```

#### Branch (Conditional - only when autoStart is true)
```typescript
<form.Field
  name="branch"
  validators={{
    onChange: ({ value }) => {
      if (mode !== 'edit' && autoStart && !value) {
        return t('taskFormDialog.branchRequired');
      }
      return undefined;
    }
  }}
>
  {(field) => (/* ... */)}
</form.Field>
```

### Form-Level Validation (Optional)

For additional safety, add a form-level validator:

```typescript
const form = useForm<TaskFormValues>({
  defaultValues: getDefaultValues(),
  validators: {
    onSubmit: ({ value }) => {
      const errors: Record<string, string> = {};
      
      if (mode !== 'edit' && autoStart) {
        if (!value.executorProfileId) {
          errors.executorProfileId = t('taskFormDialog.profileRequired');
        }
        if (!value.branch) {
          errors.branch = t('taskFormDialog.branchRequired');
        }
      }
      
      return Object.keys(errors).length ? errors : undefined;
    }
  },
  onSubmit: handleSubmit,
});
```

## Form Initialization

```typescript
const form = useForm<TaskFormValues>({
  defaultValues: getDefaultValues(),
  onSubmit: async ({ value }) => {
    if (mode === 'edit') {
      await updateTask({
        id: props.task.id,
        title: value.title,
        description: value.description,
        status: value.status,
      });
    } else if (autoStart) {
      await createAndStart({
        title: value.title,
        description: value.description,
        executorProfileId: value.executorProfileId!,
        branch: value.branch!,
        uploadedImageIds: newlyUploadedImageIds,
        images: images,
      });
    } else {
      await createTask({
        title: value.title,
        description: value.description,
      });
    }
    
    // Clean up and close
    if (mode === 'edit') {
      await cleanupUnusedImages();
    }
    modal.remove();
  },
});
```

## UI Component Wiring

### Title Input

```tsx
<form.Field
  name="title"
  validators={{
    onChange: ({ value }) => 
      value.trim() ? undefined : t('taskFormDialog.titleRequired')
  }}
>
  {(field) => (
    <Input
      value={field.state.value}
      onChange={(e) => field.handleChange(e.target.value)}
      onBlur={field.handleBlur}
      placeholder={t('taskFormDialog.titlePlaceholder')}
      className="text-lg font-medium border-none shadow-none px-0"
      disabled={form.state.isSubmitting}
      autoFocus
    />
  )}
</form.Field>
```

### Description Textarea

```tsx
<form.Field name="description">
  {(field) => (
    <FileSearchTextarea
      value={field.state.value}
      onChange={(desc) => field.handleChange(desc)}
      rows={20}
      maxRows={35}
      placeholder={t('taskFormDialog.descriptionPlaceholder')}
      className="border-none shadow-none px-0 resize-none"
      disabled={form.state.isSubmitting}
      projectId={projectId}
      onPasteFiles={handleFiles}
      disableScroll={true}
    />
  )}
</form.Field>
```

### Status Select (Edit Mode Only)

```tsx
{mode === 'edit' && (
  <form.Field name="status">
    {(field) => (
      <div className="space-y-2">
        <Label htmlFor="task-status" className="text-sm font-medium">
          {t('taskFormDialog.statusLabel')}
        </Label>
        <Select
          value={field.state.value}
          onValueChange={(value) => field.handleChange(value as TaskStatus)}
          disabled={form.state.isSubmitting}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todo">{t('taskFormDialog.statusOptions.todo')}</SelectItem>
            <SelectItem value="inprogress">{t('taskFormDialog.statusOptions.inprogress')}</SelectItem>
            <SelectItem value="inreview">{t('taskFormDialog.statusOptions.inreview')}</SelectItem>
            <SelectItem value="done">{t('taskFormDialog.statusOptions.done')}</SelectItem>
            <SelectItem value="cancelled">{t('taskFormDialog.statusOptions.cancelled')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    )}
  </form.Field>
)}
```

### Executor Profile Selector

```tsx
<form.Field
  name="executorProfileId"
  validators={{
    onChange: ({ value }) => {
      if (mode !== 'edit' && autoStart && !value) {
        return t('taskFormDialog.profileRequired');
      }
      return undefined;
    }
  }}
>
  {(field) => (
    <ExecutorProfileSelector
      profiles={profiles}
      selectedProfile={field.state.value}
      onProfileSelect={(profile) => field.handleChange(profile)}
      disabled={form.state.isSubmitting || !autoStart}
      showLabel={false}
      className="flex items-center gap-2 flex-row flex-[2] min-w-0"
      itemClassName="flex-1 min-w-0"
    />
  )}
</form.Field>
```

### Branch Selector

```tsx
<form.Field
  name="branch"
  validators={{
    onChange: ({ value }) => {
      if (mode !== 'edit' && autoStart && !value) {
        return t('taskFormDialog.branchRequired');
      }
      return undefined;
    }
  }}
>
  {(field) => (
    <BranchSelector
      branches={branches}
      selectedBranch={field.state.value}
      onBranchSelect={(branch) => field.handleChange(branch)}
      placeholder="Branch"
      className={cn(
        'h-9 flex-1 min-w-0 text-xs',
        form.state.isSubmitting && 'opacity-50 cursor-not-allowed'
      )}
    />
  )}
</form.Field>
```

### Submit Button

```tsx
<form.Subscribe
  selector={(state) => [state.canSubmit, state.isSubmitting, state.values]}
>
  {([canSubmit, isSubmitting, values]) => {
    const isDisabled = 
      !canSubmit || 
      (mode !== 'edit' && autoStart && (!values.executorProfileId || !values.branch));
    
    return (
      <Button
        onClick={() => form.handleSubmit()}
        disabled={isDisabled}
      >
        {isSubmitting ? (
          mode === 'edit' 
            ? t('taskFormDialog.updating')
            : autoStart
              ? t('taskFormDialog.starting')
              : t('taskFormDialog.creating')
        ) : (
          <>
            {mode !== 'edit' && <Plus className="h-4 w-4 mr-1.5" />}
            {mode === 'edit' ? t('taskFormDialog.updateTask') : t('taskFormDialog.create')}
          </>
        )}
      </Button>
    );
  }}
</form.Subscribe>
```

## Integration Points

### Image Upload Integration

When an image finishes uploading, update the form description:

```typescript
const handleImageUploaded = (img: ImageResponse) => {
  const markdownText = `![${img.original_name}](${img.file_path})`;
  
  form.setFieldValue('description', (prev) => 
    prev.trim() === '' ? markdownText : `${prev} ${markdownText}`
  );
  
  setImages((prev) => [...prev, img]);
  setNewlyUploadedImageIds((prev) => [...prev, img.id]);
  setShowImageUpload(true);
};
```

### Default Branch Effect

Set the default branch when it becomes available:

```typescript
useEffect(() => {
  if (!defaultBranch) return;
  if (mode !== 'edit') {
    form.setFieldValue('branch', defaultBranch);
  }
}, [defaultBranch, mode]);
```

### Load Images for Edit Mode

```typescript
useEffect(() => {
  if (!taskImages) return;
  setImages(taskImages);
  setShowImageUpload(taskImages.length > 0);
}, [taskImages]);
```

### Discard Warning Logic

Check if form is dirty or has local changes:

```typescript
const hasChanges = () => {
  return form.state.isDirty || 
         newlyUploadedImageIds.length > 0 || 
         images.length > 0;
};

const handleClose = () => {
  if (hasChanges()) {
    setShowDiscardWarning(true);
  } else {
    modal.remove();
  }
};

const handleDiscardChanges = () => {
  form.reset();
  setImages([]);
  setNewlyUploadedImageIds([]);
  setShowDiscardWarning(false);
  modal.remove();
};

const handleContinueEditing = () => {
  setShowDiscardWarning(false);
};
```

### Keyboard Shortcuts

Update keyboard shortcuts to call `form.handleSubmit()`:

```typescript
useKeySubmitTask(
  () => {
    if (!form.state.canSubmit) return;
    form.handleSubmit();
  },
  {
    enabled: modal.visible && !showDiscardWarning,
    scopes: [Scope.TaskForm],
  }
);

useKeySubmitTaskAlt(
  () => {
    if (!form.state.canSubmit) return;
    // For "create without autoStart" shortcut
    const previousAutoStart = autoStart;
    setAutoStart(false);
    form.handleSubmit();
    setAutoStart(previousAutoStart);
  },
  {
    enabled: modal.visible && !showDiscardWarning && mode !== 'edit',
    scopes: [Scope.TaskForm],
  }
);
```

## Migration Path (Incremental Steps)

### Step 1: Introduce useForm - Title & Description
- Add TanStack Form dependency (already installed)
- Define `TaskFormValues` type
- Initialize `useForm` with `title` and `description` fields
- Migrate title and description inputs to `<form.Field>`
- Replace submit button to use `form.handleSubmit()`
- Replace `state.isSubmitting` with `form.state.isSubmitting`
- **Test:** Create/edit tasks with title and description

### Step 2: Migrate Status (Edit Mode)
- Add `status` to form fields
- Wrap status Select in `<form.Field>`
- Add validator for edit mode
- **Test:** Edit mode status changes

### Step 3: Migrate ExecutorProfileId & Branch
- Add `executorProfileId` and `branch` to form fields
- Wrap selectors in `<form.Field>`
- Add conditional validators bound to `autoStart`
- Add `defaultBranch` effect with `form.setFieldValue()`
- **Test:** Create with autoStart, verify validation

### Step 4: Update Discard Logic
- Replace dirty check with `form.state.isDirty`
- Include images/newlyUploadedImageIds in discard guard
- Update discard handlers to call `form.reset()`
- **Test:** Discard warnings appear correctly

### Step 5: Clean Up Reducer
- Remove `reducer`, `Action`, `State` types
- Remove `useReducer` and `initialState`
- Replace all `dispatch` calls with individual state setters
- Remove reducer-related code
- **Test:** Full regression test of all modes

### Step 6: Final Verification
- Verify all keyboard shortcuts work
- Verify drag/drop behaviors
- Verify image uploads update description
- Run type checking: `npm run check`
- Add unit/integration tests if needed

## Code Removal Checklist

After migration, remove:
- [ ] `type State`
- [ ] `type Action`
- [ ] `function reducer()`
- [ ] `const initialState`
- [ ] `const reset()`
- [ ] `const init()`
- [ ] `const [state, dispatch] = useReducer(...)`
- [ ] All `dispatch({ type: '...', payload: ... })` calls

## Risks and Guardrails

### Conditional Validation Drift
**Risk:** `autoStart` is local state while `branch`/`profile` are form fields  
**Guard:** Duplicate the validation check in button disable logic and onSubmit

### Default Values Timing
**Risk:** Branches/profile fetched async, may not be available at init  
**Guard:** Use effects with `form.setFieldValue()` when defaults become available; don't rebuild form

### Dirty State Correctness
**Risk:** Users could lose image uploads without warning  
**Guard:** Include `images`/`newlyUploadedImageIds` in discard guard check

### Keyboard Shortcut Double Submits
**Risk:** Shortcuts could trigger multiple submits  
**Guard:** Check `form.state.canSubmit` and `form.state.isSubmitting` before calling `form.handleSubmit()`

### Mode-Specific Field Visibility
**Risk:** Form values for hidden fields (e.g., status in create mode)  
**Guard:** Initialize all fields in `defaultValues`; conditional rendering doesn't affect validation

## Testing Considerations

### Unit Tests
- Validate conditional validators fire correctly when `autoStart` changes
- Verify default values match expected values for each mode
- Test `form.setFieldValue()` for image markdown insertion

### Integration Tests
- Create task flow (with and without autoStart)
- Edit task flow
- Duplicate task flow
- Subtask creation flow
- Image upload + description update
- Discard warning scenarios
- Keyboard shortcut behaviors

### Manual Testing
- Test all 4 modes: create, edit, duplicate, subtask
- Verify drag-drop image upload works
- Verify paste image into textarea works
- Verify branch/profile selection disabled when autoStart is off
- Verify validation messages appear correctly
- Verify discard warning only shows when dirty
- Verify keyboard shortcuts work

## Future Enhancements (Optional)

### Schema-Based Validation
If adding more forms, consider Zod:

```typescript
import { z } from 'zod';

const taskFormSchema = z.object({
  title: z.string().min(1, 'Title required'),
  description: z.string(),
  status: z.nativeEnum(TaskStatus),
  executorProfileId: z.string().uuid().nullable(),
  branch: z.string(),
}).superRefine((values, ctx) => {
  if (mode !== 'edit' && autoStart) {
    if (!values.executorProfileId) {
      ctx.addIssue({
        path: ['executorProfileId'],
        code: z.ZodIssueCode.custom,
        message: 'Executor profile required when auto-starting',
      });
    }
    if (!values.branch) {
      ctx.addIssue({
        path: ['branch'],
        code: z.ZodIssueCode.custom,
        message: 'Branch required when auto-starting',
      });
    }
  }
});
```

### Advanced Path: createFormHook
When 2-3+ forms are migrated, consider:
- Shared `createFormHook` with pre-bound components
- Typed field wrappers for Input, Textarea, Select
- Shared SubmitButton component with form context
- Centralized validation patterns

## Success Criteria

- [ ] All 4 dialog modes (create, edit, duplicate, subtask) work correctly
- [ ] Form validation prevents invalid submissions
- [ ] Image uploads update description markdown
- [ ] Keyboard shortcuts work as before
- [ ] Discard warning appears when appropriate
- [ ] Type checking passes (`npm run check`)
- [ ] No regressions in functionality
- [ ] Code is more maintainable with less boilerplate
- [ ] TypeScript provides better type safety for form fields

## Estimated Effort

- **Small (3-6h):** If familiar with TanStack Form, straightforward migration
- **Medium-Large (1-2 days):** If adding comprehensive tests and handling edge cases

## References

- [TanStack Form Overview](../../dev_docs/tanstack-form.md)
- [TanStack Form Quick Start](../../dev_docs/tanstack-form-quickstart.md)
- [Current TaskFormDialog](../../frontend/src/components/dialogs/tasks/TaskFormDialog.tsx)
- [TanStack Form Docs](https://tanstack.com/form/latest)
