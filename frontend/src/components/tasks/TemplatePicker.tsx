import * as React from 'react';
import { useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  FileText,
  X,
  Bug,
  Lightbulb,
  CheckSquare,
  Zap,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/useIsMobile';

/**
 * A template that can be inserted into task descriptions
 */
export interface Template {
  id: string;
  name: string;
  description: string;
  content: string;
  icon?: React.ReactNode;
}

/**
 * Built-in templates available by default
 */
const DEFAULT_TEMPLATES: Template[] = [
  {
    id: 'bug-report',
    name: 'Bug Report',
    description: 'Steps to reproduce a bug',
    icon: <Bug className="h-4 w-4" />,
    content: `## Bug Description
Describe the bug clearly and concisely.

## Steps to Reproduce
1. Go to '...'
2. Click on '...'
3. Scroll down to '...'
4. See error

## Expected Behavior
Describe what you expected to happen.

## Actual Behavior
Describe what actually happened.

## Environment
- Browser:
- OS:
- Version:
`,
  },
  {
    id: 'feature-request',
    name: 'Feature Request',
    description: 'Request a new feature',
    icon: <Lightbulb className="h-4 w-4" />,
    content: `## Feature Description
Describe the feature you'd like to see.

## Problem Statement
What problem does this feature solve?

## Proposed Solution
Describe how you think this should work.

## Alternatives Considered
Are there other ways to solve this?

## Additional Context
Add any other context or screenshots.
`,
  },
  {
    id: 'code-review',
    name: 'Code Review Checklist',
    description: 'Checklist for reviewing code',
    icon: <CheckSquare className="h-4 w-4" />,
    content: `## Code Review Checklist

### Functionality
- [ ] Code works as expected
- [ ] Edge cases are handled
- [ ] Error handling is appropriate

### Code Quality
- [ ] Code is readable and well-organized
- [ ] No unnecessary complexity
- [ ] DRY principle followed

### Testing
- [ ] Tests are included
- [ ] Tests cover key scenarios
- [ ] All tests pass

### Security
- [ ] No sensitive data exposed
- [ ] Input validation present
- [ ] Authentication/authorization checked

### Documentation
- [ ] Comments explain complex logic
- [ ] README updated if needed
`,
  },
  {
    id: 'quick-task',
    name: 'Quick Task',
    description: 'Simple task template',
    icon: <Zap className="h-4 w-4" />,
    content: `## Goal
What needs to be accomplished?

## Acceptance Criteria
- [ ]

## Notes

`,
  },
];

export interface TemplatePickerProps {
  /**
   * Whether the picker is open
   */
  open: boolean;

  /**
   * Callback when the picker should close
   */
  onOpenChange: (open: boolean) => void;

  /**
   * Callback when a template is selected
   */
  onSelect: (template: Template) => void;

  /**
   * Custom templates to show in addition to defaults
   */
  customTemplates?: Template[];

  /**
   * Whether to show default templates
   */
  showDefaults?: boolean;

  /**
   * Whether templates are currently loading
   */
  loading?: boolean;

  /**
   * Error message to display if template loading failed
   */
  error?: string | null;

  /**
   * Callback to retry loading templates when an error occurred
   */
  onRetry?: () => void;
}

/**
 * TemplatePicker - Bottom sheet / popover for selecting templates
 *
 * Displays a searchable list of templates that can be inserted into
 * task descriptions. On mobile, displays as a bottom sheet; on desktop,
 * displays as a modal.
 */
export function TemplatePicker({
  open,
  onOpenChange,
  onSelect,
  customTemplates = [],
  showDefaults = true,
  loading = false,
  error = null,
  onRetry,
}: TemplatePickerProps) {
  const { t } = useTranslation(['tasks', 'common']);
  const isMobile = useIsMobile();
  const [searchQuery, setSearchQuery] = useState('');

  // Combine templates
  const allTemplates = useMemo(() => {
    const templates: Template[] = [];
    if (showDefaults) {
      templates.push(...DEFAULT_TEMPLATES);
    }
    templates.push(...customTemplates);
    return templates;
  }, [showDefaults, customTemplates]);

  // Filter templates by search query
  const filteredTemplates = useMemo(() => {
    if (!searchQuery.trim()) return allTemplates;

    const query = searchQuery.toLowerCase();
    return allTemplates.filter(
      (template) =>
        template.name.toLowerCase().includes(query) ||
        template.description.toLowerCase().includes(query)
    );
  }, [allTemplates, searchQuery]);

  const handleSelect = useCallback(
    (template: Template) => {
      // Close modal first to let animation complete
      onOpenChange(false);
      setSearchQuery('');

      // Defer content insertion to avoid concurrent animations
      requestAnimationFrame(() => {
        onSelect(template);
      });
    },
    [onSelect, onOpenChange]
  );

  const handleClose = useCallback(() => {
    onOpenChange(false);
    setSearchQuery('');
  }, [onOpenChange]);

  // Handle escape key
  React.useEffect(() => {
    if (!open) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, handleClose]);

  // Prevent body scroll when open on mobile
  React.useEffect(() => {
    if (!open || !isMobile) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open, isMobile]);

  const content = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="font-semibold">
          {t('templatePicker.title', 'Insert Template')}
        </h3>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClose}
          className="h-8 w-8"
          aria-label={t('common:close', 'Close')}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Search */}
      <div className="px-4 py-2 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t(
              'templatePicker.searchPlaceholder',
              'Search templates...'
            )}
            className="pl-9"
            autoFocus={!isMobile}
          />
        </div>
      </div>

      {/* Templates list */}
      <div className="overflow-y-auto flex-1 px-2 py-2">
        {/* Loading state */}
        {loading && (
          <div
            className="flex justify-center py-8"
            role="status"
            aria-live="polite"
          >
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
            <span className="sr-only">
              {t('common:states.loading', 'Loading...')}
            </span>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="flex flex-col items-center py-8 gap-3">
            <div className="text-center text-destructive">{error}</div>
            {onRetry && (
              <Button variant="outline" size="sm" onClick={onRetry}>
                {t('templatePicker.retry', 'Retry')}
              </Button>
            )}
          </div>
        )}

        {/* Empty state - no results */}
        {!loading && !error && filteredTemplates.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            {t('templatePicker.noResults', 'No templates found')}
          </div>
        )}

        {/* Templates list */}
        {!loading && !error && filteredTemplates.length > 0 && (
          <div className="space-y-1">
            {filteredTemplates.map((template) => (
              <button
                key={template.id}
                onClick={() => handleSelect(template)}
                className={cn(
                  'w-full text-left px-3 py-3 rounded-md',
                  'hover:bg-muted/50 active:bg-muted',
                  'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                  'transition-colors'
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-none pt-0.5 text-muted-foreground">
                    {template.icon || <FileText className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{template.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      {template.description}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );

  if (isMobile) {
    // Bottom sheet on mobile — portal to body so fixed positioning is viewport-relative
    return createPortal(
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 z-[10000] bg-black/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleClose}
            />

            {/* Bottom sheet */}
            <motion.div
              className={cn(
                'fixed bottom-0 left-0 right-0 z-[10001]',
                'bg-background rounded-t-xl shadow-xl',
                'flex flex-col max-h-[70vh]',
                'safe-area-inset-bottom'
              )}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            >
              {/* Drag handle */}
              <div className="flex justify-center py-2">
                <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
              </div>
              {content}
            </motion.div>
          </>
        )}
      </AnimatePresence>,
      document.body
    );
  }

  // Modal on desktop — portal to body breaks out of any transformed ancestor
  // (Framer Motion motion.div sets will-change:transform which makes fixed children
  // position relative to the animated ancestor box instead of the viewport)
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-[10000] bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
          />

          {/* Modal — x/y via FM style so translate is composed with scale, not overridden */}
          <motion.div
            className={cn(
              'fixed z-[10001] bg-background rounded-lg shadow-xl',
              'left-1/2 top-1/2',
              'w-[min(90vw,480px)] max-h-[min(80vh,600px)]',
              'flex flex-col overflow-hidden'
            )}
            style={{ x: '-50%', y: '-50%' }}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
          >
            {content}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

export default TemplatePicker;
