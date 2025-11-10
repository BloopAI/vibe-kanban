import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Slot } from '@radix-ui/react-slot';
import {
  AlertCircle,
  ChevronUp,
  File,
  Folder,
  FolderOpen,
  Home,
  Search,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { DirectoryEntry, DirectoryListResponse } from 'shared/types';

type DirectoryResolver = (path?: string) => Promise<DirectoryListResponse>;

interface DirectoryPickerRootProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  onCancel?: () => void;
  onOpen?: () => void;
  onClose?: () => void;
  startPath?: string;
  onResolveChildren: DirectoryResolver;
  canSelectEntry?: (entry: DirectoryEntry) => boolean;
  children: React.ReactNode;
}

interface DirectoryPickerContextValue {
  open: boolean;
  openPicker: () => void;
  closePicker: () => void;
  handleOpenChange: (nextOpen: boolean) => void;
  value: string;
  setValue: (value: string) => void;
  pendingPath: string;
  setPendingPath: (value: string) => void;
  currentPath: string;
  entries: DirectoryEntry[];
  filteredEntries: DirectoryEntry[];
  loading: boolean;
  error: string;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  loadDirectory: (path?: string) => Promise<void>;
  goHome: () => void;
  goUp: () => void;
  selectCurrent: () => void;
  selectEntry: (entry: DirectoryEntry) => void;
  submit: () => void;
  cancel: () => void;
  canSubmit: boolean;
  canSelectEntry: (entry: DirectoryEntry) => boolean;
  activeEntryPath: string;
  setActiveEntryPath: (path: string) => void;
}

const DirectoryPickerContext =
  React.createContext<DirectoryPickerContextValue | null>(null);

function useDirectoryPickerContext(
  component: string
): DirectoryPickerContextValue {
  const ctx = useContext(DirectoryPickerContext);
  if (!ctx) {
    throw new Error(
      `DirectoryPicker.${component} must be used within DirectoryPicker.Root`
    );
  }
  return ctx;
}

function useControllableState({
  prop,
  defaultValue,
  onChange,
}: {
  prop?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
}): [string, (value: string) => void] {
  const [state, setState] = useState(defaultValue ?? '');
  const isControlled = prop !== undefined;

  const value = isControlled ? (prop as string) : state;

  const setValue = useCallback(
    (next: string) => {
      if (!isControlled) {
        setState(next);
      }
      onChange?.(next);
    },
    [isControlled, onChange]
  );

  return [value ?? '', setValue];
}

const DirectoryPickerRoot = ({
  value: controlledValue,
  defaultValue,
  onValueChange,
  onSubmit,
  onCancel,
  onOpen,
  onClose,
  startPath,
  onResolveChildren,
  canSelectEntry = (entry) => entry.is_directory,
  children,
}: DirectoryPickerRootProps) => {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useControllableState({
    prop: controlledValue,
    defaultValue,
    onChange: onValueChange,
  });
  const [pendingPath, setPendingPath] = useState('');
  const [currentPath, setCurrentPath] = useState('');
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeEntryPath, setActiveEntryPath] = useState('');

  const latestRequest = useRef<symbol | null>(null);

  const filteredEntries = useMemo(() => {
    if (!searchTerm.trim()) return entries;

    const term = searchTerm.toLowerCase();
    return entries.filter((entry) => entry.name.toLowerCase().includes(term));
  }, [entries, searchTerm]);

  const loadDirectory = useCallback(
    async (path?: string) => {
      const requestToken = Symbol('directory-request');
      latestRequest.current = requestToken;
      setLoading(true);
      setError('');

      try {
        const result = await onResolveChildren(path);
        if (latestRequest.current !== requestToken) {
          return;
        }

        const entries = Array.isArray(result.entries) ? result.entries : [];
        setEntries(entries);

        const resolvedPath = result.current_path ?? path ?? '';
        setCurrentPath(resolvedPath);
        setPendingPath(resolvedPath);
        setActiveEntryPath('');
      } catch (err) {
        if (latestRequest.current !== requestToken) {
          return;
        }
        const message =
          err instanceof Error ? err.message : 'Failed to load directory';
        setError(message);
        setEntries([]);
      } finally {
        if (latestRequest.current === requestToken) {
          setLoading(false);
        }
      }
    },
    [onResolveChildren]
  );

  const openPicker = useCallback(() => {
    if (open) return;

    const initialPath = controlledValue ?? value ?? startPath ?? '';
    setPendingPath(initialPath);
    setOpen(true);
    setSearchTerm('');
    setError('');
    setActiveEntryPath('');
    onOpen?.();

    if (initialPath) {
      loadDirectory(initialPath).catch(() => {
        // Errors handled inside loadDirectory
      });
    } else {
      loadDirectory().catch(() => {
        // Errors handled inside loadDirectory
      });
    }
  }, [controlledValue, loadDirectory, onOpen, open, startPath, value]);

  const closePicker = useCallback(() => {
    setOpen(false);
  }, []);

  const cancel = useCallback(() => {
    closePicker();
    onCancel?.();
    onClose?.();
  }, [closePicker, onCancel, onClose]);

  const submit = useCallback(() => {
    const nextValue = pendingPath || currentPath || value;
    if (!nextValue) return;

    setValue(nextValue);
    onSubmit?.(nextValue);
    closePicker();
    onClose?.();
  }, [
    closePicker,
    currentPath,
    onClose,
    onSubmit,
    pendingPath,
    setValue,
    value,
  ]);

  const selectCurrent = useCallback(() => {
    if (!currentPath) return;
    setPendingPath(currentPath);
    setActiveEntryPath(currentPath);
  }, [currentPath]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        cancel();
      }
    },
    [cancel]
  );

  const goHome = useCallback(() => {
    loadDirectory().catch(() => {
      // Errors handled inside loadDirectory
    });
  }, [loadDirectory]);

  const goUp = useCallback(() => {
    if (!currentPath) return;
    const segments = currentPath.split('/').filter(Boolean);
    segments.pop();
    const parentPath = `/${segments.join('/')}`.replace(/\\/g, '/');
    const normalized = parentPath === '//' ? '/' : parentPath;
    loadDirectory(normalized || '/').catch(() => {
      // Errors handled inside loadDirectory
    });
  }, [currentPath, loadDirectory]);

  const selectEntry = useCallback(
    (entry: DirectoryEntry) => {
      setPendingPath(entry.path);
      setActiveEntryPath(entry.path);

      if (entry.is_directory) {
        loadDirectory(entry.path).catch(() => {
          // Errors handled inside loadDirectory
        });
      }
    },
    [loadDirectory]
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    setPendingPath(controlledValue ?? value ?? '');
  }, [controlledValue, open, value]);

  const selectableEntry = useMemo(() => {
    if (!entries.length) return undefined;
    const targetPath = pendingPath || activeEntryPath;
    if (!targetPath) return undefined;
    return entries.find((entry) => entry.path === targetPath);
  }, [activeEntryPath, entries, pendingPath]);

  const canSubmit = Boolean(
    (pendingPath || currentPath || value) &&
      (selectableEntry ? canSelectEntry(selectableEntry) : true)
  );

  const contextValue: DirectoryPickerContextValue = useMemo(
    () => ({
      open,
      openPicker,
      closePicker,
      handleOpenChange,
      value,
      setValue,
      pendingPath,
      setPendingPath,
      currentPath,
      entries,
      filteredEntries,
      loading,
      error,
      searchTerm,
      setSearchTerm,
      loadDirectory,
      goHome,
      goUp,
      selectCurrent,
      selectEntry,
      submit,
      cancel,
      canSubmit,
      canSelectEntry,
      activeEntryPath,
      setActiveEntryPath,
    }),
    [
      open,
      openPicker,
      closePicker,
      handleOpenChange,
      value,
      setValue,
      pendingPath,
      currentPath,
      entries,
      filteredEntries,
      loading,
      error,
      searchTerm,
      loadDirectory,
      goHome,
      goUp,
      selectCurrent,
      selectEntry,
      submit,
      cancel,
      canSubmit,
      canSelectEntry,
      activeEntryPath,
    ]
  );

  return (
    <DirectoryPickerContext.Provider value={contextValue}>
      {children}
    </DirectoryPickerContext.Provider>
  );
};

type DirectoryPickerTriggerProps = React.ComponentPropsWithoutRef<'button'> & {
  asChild?: boolean;
};

const DirectoryPickerTrigger = React.forwardRef<
  HTMLElement,
  DirectoryPickerTriggerProps
>(({ asChild = false, children, onClick, ...props }, ref) => {
  const ctx = useDirectoryPickerContext('Trigger');
  const Comp: any = asChild ? Slot : 'button';

  return (
    <Comp
      {...props}
      ref={ref as any}
      onClick={(event: React.MouseEvent) => {
        onClick?.(event as React.MouseEvent<HTMLButtonElement>);
        if (event.defaultPrevented) return;
        ctx.openPicker();
      }}
    >
      {children}
    </Comp>
  );
});
DirectoryPickerTrigger.displayName = 'DirectoryPickerTrigger';

const DirectoryPickerPortal = ({ children }: { children: React.ReactNode }) => {
  const ctx = useDirectoryPickerContext('Portal');
  if (!ctx.open) return null;

  return (
    <Dialog open={ctx.open} onOpenChange={ctx.handleOpenChange}>
      {children}
    </Dialog>
  );
};

const DirectoryPickerOverlay = () => null;

const DirectoryPickerContent = ({
  children,
  className,
}: React.HTMLAttributes<HTMLDivElement>) => (
  <DialogContent
    className={cn(
      'max-w-[600px] w-full h-[700px] flex flex-col overflow-hidden',
      className
    )}
  >
    {children}
  </DialogContent>
);

const DirectoryPickerTitle = DialogTitle;
const DirectoryPickerDescription = DialogDescription;

const DirectoryPickerPathInput = ({
  className,
  placeholder,
}: React.InputHTMLAttributes<HTMLInputElement>) => {
  const ctx = useDirectoryPickerContext('PathInput');

  return (
    <Input
      value={ctx.pendingPath}
      onChange={(event) => ctx.setPendingPath(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          ctx.loadDirectory(ctx.pendingPath).catch(() => {
            // Errors handled inside loadDirectory
          });
        }
      }}
      placeholder={placeholder ?? '/path/to/your/project'}
      className={cn('flex-1 min-w-0', className)}
    />
  );
};

const DirectoryPickerGoButton = ({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) => {
  const ctx = useDirectoryPickerContext('GoButton');
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      onClick={() => {
        if (!ctx.pendingPath) return;
        ctx.loadDirectory(ctx.pendingPath).catch(() => {
          // Errors handled inside loadDirectory
        });
      }}
      {...props}
    >
      {children ?? 'Go'}
    </Button>
  );
};

const DirectoryPickerSearch = ({
  className,
  placeholder = 'Filter folders and files...',
}: React.InputHTMLAttributes<HTMLInputElement>) => {
  const ctx = useDirectoryPickerContext('Search');

  return (
    <div className={cn('relative', className)}>
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={ctx.searchTerm}
        onChange={(event) => ctx.setSearchTerm(event.target.value)}
        placeholder={placeholder}
        className="pl-10"
      />
    </div>
  );
};

const DirectoryPickerToolbar = ({
  children,
  className,
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex items-center space-x-2 min-w-0', className)}>
    {children}
  </div>
);

const DirectoryPickerHomeButton = ({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) => {
  const ctx = useDirectoryPickerContext('HomeButton');
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      onClick={() => ctx.goHome()}
      {...props}
    >
      <Home className="h-4 w-4" />
    </Button>
  );
};

const DirectoryPickerUpButton = ({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) => {
  const ctx = useDirectoryPickerContext('UpButton');
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={!ctx.currentPath || ctx.currentPath === '/'}
      className={className}
      onClick={() => ctx.goUp()}
      {...props}
    >
      <ChevronUp className="h-4 w-4" />
    </Button>
  );
};

const DirectoryPickerCurrentPath = ({
  className,
}: React.HTMLAttributes<HTMLDivElement>) => {
  const ctx = useDirectoryPickerContext('CurrentPath');
  return (
    <div
      className={cn('text-sm text-muted-foreground flex-1 truncate', className)}
    >
      {ctx.currentPath || 'Home'}
    </div>
  );
};

const DirectoryPickerSelectCurrent = ({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) => {
  const ctx = useDirectoryPickerContext('SelectCurrent');
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      disabled={!ctx.currentPath}
      onClick={() => ctx.selectCurrent()}
      {...props}
    >
      {children ?? 'Select Current'}
    </Button>
  );
};

const DirectoryPickerView = ({
  children,
  className,
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex-1 border rounded-md overflow-auto', className)}>
    {children}
  </div>
);

const DirectoryPickerList = ({
  className,
}: React.HTMLAttributes<HTMLDivElement>) => {
  const ctx = useDirectoryPickerContext('List');

  if (ctx.loading) {
    return (
      <div className="p-4 text-center text-muted-foreground">Loading...</div>
    );
  }

  if (ctx.error) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{ctx.error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (ctx.filteredEntries.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        {ctx.searchTerm.trim() ? 'No matches found' : 'No folders found'}
      </div>
    );
  }

  return (
    <div className={cn('p-2 space-y-1', className)}>
      {ctx.filteredEntries.map((entry) => {
        const isSelected = ctx.activeEntryPath === entry.path;
        const isDisabled = !ctx.canSelectEntry(entry) && !entry.is_directory;

        return (
          <button
            key={entry.path}
            type="button"
            className={cn(
              'flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm transition-colors',
              'hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60',
              isSelected && 'bg-accent',
              entry.is_directory ? '' : 'opacity-80'
            )}
            onClick={() => ctx.selectEntry(entry)}
            disabled={isDisabled}
          >
            {entry.is_directory ? (
              entry.is_git_repo ? (
                <FolderOpen className="h-4 w-4 text-success" />
              ) : (
                <Folder className="h-4 w-4 text-blue-600" />
              )
            ) : (
              <File className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="flex-1 truncate" title={entry.path}>
              {entry.name}
            </span>
            {entry.is_git_repo && (
              <span className="text-xs text-success bg-green-100 px-2 py-0.5 rounded">
                git repo
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

const DirectoryPickerFooter = ({
  children,
  className,
}: React.HTMLAttributes<HTMLDivElement>) => (
  <DialogFooter className={className}>{children}</DialogFooter>
);

const DirectoryPickerCancel = ({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) => {
  const ctx = useDirectoryPickerContext('Cancel');
  return (
    <Button
      type="button"
      variant="outline"
      className={className}
      onClick={() => ctx.cancel()}
      {...props}
    >
      {children ?? 'Cancel'}
    </Button>
  );
};

const DirectoryPickerSubmit = ({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) => {
  const ctx = useDirectoryPickerContext('Submit');
  return (
    <Button
      type="button"
      className={className}
      onClick={() => ctx.submit()}
      disabled={!ctx.canSubmit}
      {...props}
    >
      {children ?? 'Select Path'}
    </Button>
  );
};

export const DirectoryPicker = {
  Root: DirectoryPickerRoot,
  Trigger: DirectoryPickerTrigger,
  Portal: DirectoryPickerPortal,
  Overlay: DirectoryPickerOverlay,
  Content: DirectoryPickerContent,
  Title: DirectoryPickerTitle,
  Description: DirectoryPickerDescription,
  PathInput: DirectoryPickerPathInput,
  Search: DirectoryPickerSearch,
  Toolbar: DirectoryPickerToolbar,
  HomeButton: DirectoryPickerHomeButton,
  UpButton: DirectoryPickerUpButton,
  CurrentPath: DirectoryPickerCurrentPath,
  SelectCurrent: DirectoryPickerSelectCurrent,
  View: DirectoryPickerView,
  List: DirectoryPickerList,
  Footer: DirectoryPickerFooter,
  Cancel: DirectoryPickerCancel,
  Submit: DirectoryPickerSubmit,
  GoButton: DirectoryPickerGoButton,
};

export type { DirectoryPickerRootProps };
