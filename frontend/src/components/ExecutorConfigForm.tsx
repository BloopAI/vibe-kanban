import { useMemo, useEffect, useState, useCallback } from 'react';
import Form from '@rjsf/core';
import type { IChangeEvent } from '@rjsf/core';
import { RJSFValidationError } from '@rjsf/utils';
import validator from '@rjsf/validator-ajv8';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { shadcnTheme } from './rjsf';
import { BaseCodingAgent } from 'shared/types';
// Using custom shadcn/ui widgets instead of @rjsf/shadcn theme

interface ExecutorConfigFormProps {
  executor: BaseCodingAgent;
  value: unknown;
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
    return schemas[executor];
  }, [executor]);

  // Custom handler for env field updates
  const handleEnvChange = useCallback(
    (envData: Record<string, string> | undefined) => {
      const newFormData = {
        ...(formData as Record<string, unknown>),
        env: envData,
      };
      setFormData(newFormData);
      if (onChange) {
        onChange(newFormData);
      }
    },
    [formData, onChange]
  );

  const uiSchema = useMemo(
    () => ({
      env: {
        'ui:field': 'KeyValueField',
      },
    }),
    []
  );

  // Pass the env update handler via formContext
  const formContext = useMemo(
    () => ({
      onEnvChange: handleEnvChange,
    }),
    [handleEnvChange]
  );

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
            uiSchema={uiSchema}
            formData={formData}
            formContext={formContext}
            onChange={handleChange}
            onSubmit={handleSubmit}
            onError={handleError}
            validator={validator}
            disabled={disabled}
            liveValidate
            showErrorList={false}
            widgets={shadcnTheme.widgets}
            templates={shadcnTheme.templates}
            fields={shadcnTheme.fields}
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
