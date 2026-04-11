import { useMemo, useRef } from 'react';
import { normalizeEnrollmentCode } from '@/shared/lib/relayPake';

export function PairingCodeInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (nextValue: string) => void;
  disabled?: boolean;
}) {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const normalizedValue = normalizeEnrollmentCode(value).slice(0, 6);
  const characters = useMemo(
    () => Array.from({ length: 6 }, (_, index) => normalizedValue[index] ?? ''),
    [normalizedValue]
  );

  const setCharacterAt = (index: number, char: string) => {
    const next = [...characters];
    next[index] = char;
    onChange(next.join(''));
  };

  return (
    <div
      className="flex gap-2"
      onPaste={(event) => {
        const pasted = normalizeEnrollmentCode(
          event.clipboardData.getData('text')
        ).slice(0, 6);
        if (!pasted) {
          return;
        }

        event.preventDefault();
        onChange(pasted);
        const focusIndex = Math.min(pasted.length, 5);
        inputsRef.current[focusIndex]?.focus();
      }}
    >
      {characters.map((char, index) => (
        <input
          key={index}
          ref={(element) => {
            inputsRef.current[index] = element;
          }}
          type="text"
          inputMode="text"
          autoComplete="one-time-code"
          value={char}
          maxLength={1}
          disabled={disabled}
          onChange={(event) => {
            const nextChar = normalizeEnrollmentCode(event.target.value).slice(
              -1
            );
            setCharacterAt(index, nextChar);
            if (nextChar && index < 5) {
              inputsRef.current[index + 1]?.focus();
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Backspace' && !characters[index] && index > 0) {
              inputsRef.current[index - 1]?.focus();
            }
            if (event.key === 'ArrowLeft' && index > 0) {
              event.preventDefault();
              inputsRef.current[index - 1]?.focus();
            }
            if (event.key === 'ArrowRight' && index < 5) {
              event.preventDefault();
              inputsRef.current[index + 1]?.focus();
            }
          }}
          className="w-10 h-12 rounded-sm border border-border bg-panel text-center font-mono text-lg uppercase text-high focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-50"
        />
      ))}
    </div>
  );
}
