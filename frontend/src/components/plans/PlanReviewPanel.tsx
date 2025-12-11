import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlanSteps, usePlanStepsMutations } from '@/hooks';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Trash2,
  Edit2,
  Check,
  X,
  Play,
  ChevronUp,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import type { PlanStep } from 'shared/types';

interface PlanReviewPanelProps {
  attemptId: string;
  onCreateSubtasks?: () => void;
  onClose?: () => void;
}

export function PlanReviewPanel({
  attemptId,
  onCreateSubtasks,
  onClose,
}: PlanReviewPanelProps) {
  const { t } = useTranslation('tasks');
  const { data: steps = [], isLoading } = usePlanSteps(attemptId);
  const { updateStep, deleteStep, reorderSteps, createSubtasks } =
    usePlanStepsMutations(attemptId, {
      onCreateSubtasksSuccess: () => {
        onCreateSubtasks?.();
      },
    });

  const [isExpanded, setIsExpanded] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    title: string;
    description: string;
  }>({
    title: '',
    description: '',
  });
  const [autoStart, setAutoStart] = useState(true);

  const handleEdit = (step: PlanStep) => {
    setEditingId(step.id);
    setEditForm({
      title: step.title,
      description: step.description || '',
    });
  };

  const handleSave = (stepId: string) => {
    updateStep.mutate({
      stepId,
      data: {
        title: editForm.title,
        description: editForm.description || null,
        status: null,
        sequence_order: null,
        auto_start: null,
      },
    });
    setEditingId(null);
  };

  const handleCancel = () => {
    setEditingId(null);
  };

  const handleDelete = (stepId: string) => {
    if (confirm(t('planSteps.deleteConfirm', 'Delete this step?'))) {
      deleteStep.mutate(stepId);
    }
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newOrder = steps.map((s, i) => ({
      id: s.id,
      sequence_order:
        i === index
          ? steps[i - 1].sequence_order
          : i === index - 1
            ? steps[index].sequence_order
            : s.sequence_order,
    }));
    reorderSteps.mutate(newOrder);
  };

  const handleMoveDown = (index: number) => {
    if (index === steps.length - 1) return;
    const newOrder = steps.map((s, i) => ({
      id: s.id,
      sequence_order:
        i === index
          ? steps[i + 1].sequence_order
          : i === index + 1
            ? steps[index].sequence_order
            : s.sequence_order,
    }));
    reorderSteps.mutate(newOrder);
  };

  const handleCreateSubtasks = () => {
    createSubtasks.mutate();
  };

  if (isLoading) {
    return (
      <div className="p-4 text-muted-foreground">
        {t('planSteps.loading', 'Loading plan steps...')}
      </div>
    );
  }

  if (steps.length === 0) {
    return (
      <div className="p-4 text-muted-foreground">
        {t(
          'planSteps.noSteps',
          'No plan steps found. The plan may not have been parsed correctly.'
        )}
      </div>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 hover:text-foreground transition-colors"
        >
          {isExpanded ? (
            <ChevronDown className="h-5 w-5" />
          ) : (
            <ChevronRight className="h-5 w-5" />
          )}
          <CardTitle className="text-left">
            {t('planSteps.reviewTitle', 'Review Plan Steps')}
            {!isExpanded && ` (${steps.length})`}
          </CardTitle>
        </button>
        {isExpanded && (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                id="auto-start"
                checked={autoStart}
                onCheckedChange={setAutoStart}
              />
              <Label htmlFor="auto-start">
                {t('planSteps.autoStartNext', 'Auto-start next step')}
              </Label>
            </div>
          </div>
        )}
      </CardHeader>
      {isExpanded && <CardContent className="space-y-3">
        {steps.map((step, index) => (
          <div
            key={step.id}
            className="flex items-start gap-2 p-3 border rounded-lg bg-card"
          >
            {/* Reorder controls */}
            <div className="flex flex-col gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => handleMoveUp(index)}
                disabled={index === 0}
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => handleMoveDown(index)}
                disabled={index === steps.length - 1}
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>

            {/* Step number */}
            <Badge variant="outline" className="mt-1">
              {index + 1}
            </Badge>

            {/* Content */}
            <div className="flex-1 min-w-0">
              {editingId === step.id ? (
                <div className="space-y-2">
                  <Input
                    value={editForm.title}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, title: e.target.value }))
                    }
                    placeholder={t('planSteps.titlePlaceholder', 'Step title')}
                  />
                  <Textarea
                    value={editForm.description}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, description: e.target.value }))
                    }
                    placeholder={t(
                      'planSteps.descriptionPlaceholder',
                      'Step description (optional)'
                    )}
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleSave(step.id)}>
                      <Check className="h-4 w-4 mr-1" />{' '}
                      {t('common.save', 'Save')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={handleCancel}>
                      <X className="h-4 w-4 mr-1" /> {t('common.cancel', 'Cancel')}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="font-medium">{step.title}</div>
                  {step.description && (
                    <div className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                      {step.description}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Actions */}
            {editingId !== step.id && (
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handleEdit(step)}
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  onClick={() => handleDelete(step.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        ))}

        {/* Action buttons */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          {onClose && (
            <Button variant="outline" onClick={onClose}>
              {t('common.cancel', 'Cancel')}
            </Button>
          )}
          <Button
            onClick={handleCreateSubtasks}
            disabled={createSubtasks.isPending}
          >
            <Play className="h-4 w-4 mr-2" />
            {createSubtasks.isPending
              ? t('planSteps.creating', 'Creating...')
              : t('planSteps.createAndStart', 'Create Subtasks & Start')}
          </Button>
        </div>
      </CardContent>}
    </Card>
  );
}
