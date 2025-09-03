import { useMemo, useEffect, useState } from 'react';
import Form from '@rjsf/shadcn';
import { RJSFSchema, RJSFValidationError } from '@rjsf/utils';
import validator from '@rjsf/validator-ajv8';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
// Unused imports commented out - using default @rjsf/shadcn components instead
// import { Input } from '@/components/ui/input';
// import { Label } from '@/components/ui/label';
// import { Checkbox } from '@/components/ui/checkbox';
// import {
//   Select,
//   SelectContent,
//   SelectItem,
//   SelectTrigger,
//   SelectValue,
// } from '@/components/ui/select';

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
  disabled?: boolean;
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

// Note: Custom widgets commented out - currently using default @rjsf/shadcn widgets
// Will uncomment if customization is needed in the future

// const CustomTextWidget = (props: any) => {
//   const {
//     id,
//     value,
//     onChange,
//     onBlur,
//     onFocus,
//     disabled,
//     readonly,
//     placeholder,
//   } = props;
//   return (
//     <Input
//       id={id}
//       value={value || ''}
//       onChange={(e) => onChange(e.target.value)}
//       onBlur={onBlur && ((e) => onBlur(id, e.target.value))}
//       onFocus={onFocus && ((e) => onFocus(id, e.target.value))}
//       disabled={disabled || readonly}
//       placeholder={placeholder}
//     />
//   );
// };

// const CustomCheckboxWidget = (props: any) => {
//   const { id, value, onChange, disabled, readonly } = props;
//   return (
//     <Checkbox
//       id={id}
//       checked={!!value}
//       onCheckedChange={(checked) => onChange(checked)}
//       disabled={disabled || readonly}
//     />
//   );
// };

// const CustomSelectWidget = (props: any) => {
//   const { id, value, onChange, disabled, readonly, options } = props;
//   const { enumOptions } = options;

//   return (
//     <Select
//       value={value || ''}
//       onValueChange={onChange}
//       disabled={disabled || readonly}
//     >
//       <SelectTrigger id={id}>
//         <SelectValue placeholder="Select option..." />
//       </SelectTrigger>
//       <SelectContent>
//         {enumOptions?.map((option: any) => (
//           <SelectItem key={option.value} value={option.value}>
//             {option.label}
//           </SelectItem>
//         ))}
//       </SelectContent>
//     </Select>
//   );
// };

// Note: Custom widgets and templates commented out - not currently used
// const customWidgets = {
//   TextWidget: CustomTextWidget,
//   CheckboxWidget: CustomCheckboxWidget,
//   SelectWidget: CustomSelectWidget,
// };

// const customTemplates = {
//   ObjectFieldTemplate: (props: any) => {
//     const { properties, title, description } = props;
//     return (
//       <div className="space-y-4">
//         {title && <h3 className="text-lg font-semibold">{title}</h3>}
//         {description && (
//           <p className="text-sm text-muted-foreground mb-4">{description}</p>
//         )}
//         {properties.map((element: any) => element.content)}
//       </div>
//     );
//   },
// };

export function ExecutorConfigForm({
  executor,
  value,
  onSubmit,
  onChange,
  disabled = false,
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

  const handleSubmit = ({ formData: submitData }: any) => {
    setValidationErrors([]);
    if (onSubmit) {
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
    <div className="space-y-6">
      <Card>
        <CardContent className="p-0">
          <Form
            schema={schema}
            formData={formData}
            onChange={handleChange}
            onSubmit={handleSubmit}
            onError={handleError}
            validator={validator}
            // widgets={customWidgets}
            // templates={customTemplates}
            disabled={disabled}
            liveValidate
            showErrorList={false}
          >
            {onSubmit && (
              <div className="flex justify-end pt-4">
                <Button
                  type="submit"
                  disabled={disabled || validationErrors.length > 0}
                >
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
