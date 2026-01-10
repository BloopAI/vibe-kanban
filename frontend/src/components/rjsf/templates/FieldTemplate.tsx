import { FieldTemplateProps } from '@rjsf/utils';

export const FieldTemplate = (props: FieldTemplateProps) => {
  const {
    children,
    rawErrors = [],
    rawHelp,
    rawDescription,
    label,
    required,
    schema,
    id,
  } = props;

  // Check if type is object or includes object (for nullable types like ["object", "null"])
  const typeArray = Array.isArray(schema.type) ? schema.type : [schema.type];
  const isObject = typeArray.includes('object');
  const isArray = typeArray.includes('array');

  if (isObject) {
    return children;
  }

  // Check if this field is an item inside an array (id contains a numeric index like _0, _1, etc.)
  const isArrayItem = id && /_\d+$/.test(id);

  // For array items, render just the input without the two-column layout
  if (isArrayItem) {
    return (
      <div className="w-full">
        {children}
        {rawErrors.length > 0 && (
          <div className="space-y-1 mt-1">
            {rawErrors.map((error, index) => (
              <p key={index} className="text-sm text-destructive">
                {error}
              </p>
            ))}
          </div>
        )}
      </div>
    );
  }

  // For array fields, use a stacked layout instead of two-column
  if (isArray) {
    return (
      <div className="py-4 space-y-3">
        {/* Header with label and description */}
        <div className="space-y-1">
          {label && (
            <div className="text-sm font-bold leading-relaxed">
              {label}
              {required && <span className="text-destructive ml-1">*</span>}
            </div>
          )}
          {rawDescription && (
            <p className="text-sm text-muted-foreground leading-relaxed">
              {rawDescription}
            </p>
          )}
        </div>

        {/* Array content */}
        <div className="space-y-2">
          {children}
          {rawErrors.length > 0 && (
            <div className="space-y-1">
              {rawErrors.map((error, index) => (
                <p key={index} className="text-sm text-destructive">
                  {error}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Two-column layout for other field types
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-6">
      {/* Left column: Label and description */}
      <div className="space-y-2">
        {label && (
          <div className="text-sm font-bold leading-relaxed">
            {label}
            {required && <span className="text-destructive ml-1">*</span>}
          </div>
        )}

        {rawDescription && (
          <p className="text-sm text-muted-foreground leading-relaxed">
            {rawDescription}
          </p>
        )}

        {rawHelp && (
          <p className="text-sm text-muted-foreground leading-relaxed">
            {rawHelp}
          </p>
        )}
      </div>

      {/* Right column: Field content */}
      <div className="space-y-2">
        {children}

        {rawErrors.length > 0 && (
          <div className="space-y-1">
            {rawErrors.map((error, index) => (
              <p key={index} className="text-sm text-destructive">
                {error}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
