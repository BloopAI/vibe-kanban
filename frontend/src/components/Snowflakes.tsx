import { useState, useEffect } from 'react';

export function Snowflakes() {
  const [isIdle, setIsIdle] = useState(false);

  useEffect(() => {
    let timeout = setTimeout(() => setIsIdle(true), 30000);

    const reset = () => {
      setIsIdle(false);
      clearTimeout(timeout);
      timeout = setTimeout(() => setIsIdle(true), 30000);
    };

    window.addEventListener('click', reset);

    return () => {
      clearTimeout(timeout);
      window.removeEventListener('click', reset);
    };
  }, []);

  if (!isIdle) return null;

  return (
    <div className="snowflakes" aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className="snowflake">
          ❄
        </span>
      ))}
    </div>
  );
}
