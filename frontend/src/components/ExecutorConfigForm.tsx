import { useMemo, useEffect, useState } from 'react';
import Form from '@rjsf/core';
import type { IChangeEvent } from '@rjsf/core';
import { RJSFValidationError } from '@rjsf/utils';
import { customizeValidator } from '@rjsf/validator-ajv8';

import { Alert, AlertDescription } from '@/components/ui/alert';

// Create a custom validator that registers 'textarea' as a valid format
// This suppresses the "unknown format 'textarea' ignored in schema" warning
const validator = customizeValidator({
  customFormats: {
    textarea: () => true, // Always valid - textarea is a UI hint, not a validation constraint
  },
});
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { shadcnTheme } from './rjsf';
import { BaseCodingAgent } from 'shared/types';
import type { AgentRuntimeCapabilities } from '@/lib/agentRuntimeCapabilities';
// Using custom shadcn/ui widgets instead of @rjsf/shadcn theme

interface ExecutorConfigFormProps {
  executor: BaseCodingAgent;
  value: unknown;
  runtimeCapabilities?: AgentRuntimeCapabilities | null;
  onSubmit?: (formData: unknown) => void;
  onChange?: (formData: unknown) => void;
  onSave?: (formData: unknown) => Promise<void>;
  disabled?: boolean;
  isSaving?: boolean;
  isDirty?: boolean;
}

import schemas from 'virtual:executor-schemas';

export function ExecutorConfigForm({
  executor,
  value,
  runtimeCapabilities,
  onSubmit,
  onChange,
  onSave,
  disabled = false,
  isSaving = false,
  isDirty = false,
}: ExecutorConfigFormProps) {
  const [formData, setFormData] = useState<unknown>(value || {});
  const [validationErrors, setValidationErrors] = useState<
    RJSFValidationError[]
  >([]);

  const schema = useMemo(() => {
    const baseSchema = schemas[executor];
    if (!baseSchema || executor !== BaseCodingAgent.CODEX) {
      return baseSchema;
    }

    const nextSchema = JSON.parse(JSON.stringify(baseSchema)) as Record<
      string,
      unknown
    >;
    const properties = (nextSchema.properties ?? {}) as Record<string, unknown>;

    if (runtimeCapabilities?.models?.length) {
      const defaultModel =
        runtimeCapabilities.models.find((model) => model.is_default)?.display_name ??
        'Runtime default';
      properties.model = {
        ...(properties.model as Record<string, unknown>),
        enum: [
          ...runtimeCapabilities.models.map((model) => model.model),
          null,
        ],
        enumNames: [
          ...runtimeCapabilities.models.map(
            (model) => `${model.display_name} (${model.model})`
          ),
          `Use ${defaultModel}`,
        ],
      };
    }

    if (runtimeCapabilities?.collaboration_modes?.length) {
      const discoveredModes = runtimeCapabilities.collaboration_modes.filter(
        (mode): mode is typeof mode & { value: string } => !!mode.value
      );
      if (discoveredModes.length) {
        properties.collaboration_mode = {
          ...(properties.collaboration_mode as Record<string, unknown>),
          enum: [...discoveredModes.map((mode) => mode.value), null],
          enumNames: [
            ...discoveredModes.map((mode) => {
              const details = [mode.model, mode.reasoning_effort]
                .filter(Boolean)
                .join(' • ');
              return details ? `${mode.label} (${details})` : mode.label;
            }),
            'No native collaboration mode',
          ],
        };
      }
    }

    return nextSchema;
  }, [executor, runtimeCapabilities]);

  useEffect(() => {
    setFormData(value || {});
    setValidationErrors([]);
  }, [value, executor]);

  const handleChange = (event: IChangeEvent<unknown>) => {
    const newFormData = event.formData;
    setFormData(newFormData);
    if (onChange) {
      onChange(newFormData);
    }
  };

  const handleSubmit = async (event: IChangeEvent<unknown>) => {
    const submitData = event.formData;
    setValidationErrors([]);
    if (onSave) {
      await onSave(submitData);
    } else if (onSubmit) {
      onSubmit(submitData);
    }
  };

  const handleError = (errors: RJSFValidationError[]) => {
    setValidationErrors(errors);
  };

  if (!schema) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Schema not found for executor type: {executor}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-8">
      <Card>
        <CardContent className="p-0">
          <Form
            schema={schema}
            formData={formData}
            onChange={handleChange}
            onSubmit={handleSubmit}
            onError={handleError}
            validator={validator}
            disabled={disabled}
            liveValidate
            showErrorList={false}
            widgets={shadcnTheme.widgets}
            templates={shadcnTheme.templates}
          >
            {onSave && (
              <div className="flex justify-end pt-4">
                <Button
                  type="submit"
                  disabled={!isDirty || validationErrors.length > 0 || isSaving}
                >
                  {isSaving && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Save Configuration
                </Button>
              </div>
            )}
          </Form>
        </CardContent>
      </Card>

      {validationErrors.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            <ul className="list-disc list-inside space-y-1">
              {validationErrors.map((error, index) => (
                <li key={index}>
                  {error.property}: {error.message}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
