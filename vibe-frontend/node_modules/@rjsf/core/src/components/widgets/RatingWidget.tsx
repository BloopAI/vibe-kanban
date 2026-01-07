import { FocusEvent, useCallback } from 'react';
import { FormContextType, RJSFSchema, StrictRJSFSchema, WidgetProps } from '@rjsf/utils';

/** The `RatingWidget` component renders a star or heart rating input
 *
 * Features:
 * - Configurable number of stars/hearts (1-5) with default of 5
 * - Supports different shapes (star, heart)
 * - Supports minimum and maximum values from schema
 * - Handles required, disabled, and readonly states
 * - Provides focus and blur event handling for accessibility
 * - Uses Unicode characters for better visual representation
 *
 * @param props - The `WidgetProps` for this component
 */
export default function RatingWidget<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any,
>({
  id,
  value,
  required,
  disabled,
  readonly,
  autofocus,
  onChange,
  onFocus,
  onBlur,
  schema,
  options,
  htmlName,
}: WidgetProps<T, S, F>) {
  const { stars = 5, shape = 'star' } = options;

  // Use schema.maximum if provided, otherwise use stars option (limited to 1-5)
  const numStars = schema.maximum ? Math.min(schema.maximum, 5) : Math.min(Math.max(stars as number, 1), 5);
  const min = schema.minimum || 0;

  /** Handles clicking on a star to set the rating */
  const handleStarClick = useCallback(
    (starValue: number) => {
      if (!disabled && !readonly) {
        onChange(starValue);
      }
    },
    [onChange, disabled, readonly],
  );

  /** Handles focus events for accessibility */
  const handleFocus = useCallback(
    (event: FocusEvent<HTMLSpanElement>) => {
      if (onFocus) {
        // Get the star value from the data attribute
        const starValue = Number((event.target as HTMLElement).dataset.value);
        onFocus(id, starValue);
      }
    },
    [onFocus, id],
  );

  /** Handles blur events for accessibility */
  const handleBlur = useCallback(
    (event: FocusEvent<HTMLSpanElement>) => {
      if (onBlur) {
        // Get the star value from the data attribute
        const starValue = Number((event.target as HTMLElement).dataset.value);
        onBlur(id, starValue);
      }
    },
    [onBlur, id],
  );

  // Get the appropriate Unicode character based on shape option
  const getSymbol = (isFilled: boolean): string => {
    if (shape === 'heart') {
      return isFilled ? '♥' : '♡';
    }
    return isFilled ? '★' : '☆';
  };

  return (
    <>
      <div
        className='rating-widget'
        style={{
          display: 'inline-flex',
          fontSize: '1.5rem',
          cursor: disabled || readonly ? 'default' : 'pointer',
        }}
      >
        {[...Array(numStars)].map((_, index) => {
          const starValue = min + index;
          const isFilled = starValue <= value;

          return (
            <span
              key={index}
              onClick={() => handleStarClick(starValue)}
              onFocus={handleFocus}
              onBlur={handleBlur}
              data-value={starValue}
              tabIndex={disabled || readonly ? -1 : 0}
              role='radio'
              aria-checked={starValue === value}
              aria-label={`${starValue} ${shape === 'heart' ? 'heart' : 'star'}${starValue === 1 ? '' : 's'}`}
              style={{
                color: isFilled ? '#FFD700' : '#ccc',
                padding: '0 0.2rem',
                transition: 'color 0.2s',
                userSelect: 'none',
              }}
            >
              {getSymbol(isFilled)}
            </span>
          );
        })}
        <input
          type='hidden'
          id={id}
          name={htmlName || id}
          value={value || ''}
          required={required}
          disabled={disabled || readonly}
          aria-hidden='true'
        />
      </div>
    </>
  );
}
