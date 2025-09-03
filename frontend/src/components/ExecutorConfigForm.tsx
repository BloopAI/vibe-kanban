import { useMemo, useEffect, useState } from 'react';
import Form from '@rjsf/core';
import { RJSFSchema, RJSFValidationError } from '@rjsf/utils';
import validator from '@rjsf/validator-ajv8';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { shadcnTheme } from './rjsf';
// Using custom shadcn/ui widgets instead of @rjsf/shadcn theme

// Import schemas statically
import ampSchema from '../../../shared/schemas/amp.json';
import claudeCodeSchema from '../../../shared/schemas/claude_code.json';
import geminiSchema from '../../../shared/schemas/gemini.json';
import codexSchema from '../../../shared/schemas/codex.json';
import cursorSchema from '../../../shared/schemas/cursor.json';
import opencodeSchema from '../../../shared/schemas/opencode.json';
import qwenCodeSchema from '../../../shared/schemas/qwen_code.json';

type ExecutorType =
  | 'AMP'
  | 'CLAUDE_CODE'
  | 'GEMINI'
  | 'CODEX'
  | 'CURSOR'
  | 'OPENCODE'
  | 'QWEN_CODE';

interface ExecutorConfigFormProps {
  executor: ExecutorType;
  value: any;
  onSubmit?: (formData: any) => void;
  onChange?: (formData: any) => void;
  onSave?: (formData: any) => Promise<void>;
  disabled?: boolean;
  isSaving?: boolean;
  isDirty?: boolean;
}

const schemas: Record<ExecutorType, RJSFSchema> = {
  AMP: ampSchema as RJSFSchema,
  CLAUDE_CODE: claudeCodeSchema as RJSFSchema,
  GEMINI: geminiSchema as RJSFSchema,
  CODEX: codexSchema as RJSFSchema,
  CURSOR: cursorSchema as RJSFSchema,
  OPENCODE: opencodeSchema as RJSFSchema,
  QWEN_CODE: qwenCodeSchema as RJSFSchema,
};

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
  const [formData, setFormData] = useState(value || {});
  const [validationErrors, setValidationErrors] = useState<
    RJSFValidationError[]
  >([]);

  const schema = useMemo(() => {
    return schemas[executor];
  }, [executor]);

  useEffect(() => {
    setFormData(value || {});
    setValidationErrors([]);
  }, [value, executor]);

  const handleChange = ({ formData: newFormData }: any) => {
    setFormData(newFormData);
    if (onChange) {
      onChange(newFormData);
    }
  };

  const handleSubmit = async ({ formData: submitData }: any) => {
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
