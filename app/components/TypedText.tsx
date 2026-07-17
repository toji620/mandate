'use client';

import { useEffect, useState } from 'react';

/**
 * Types `text` out character by character with a caret, console-style.
 * When `active` is false (existing content, reduced motion), renders
 * the full text immediately.
 */
export default function TypedText({
  text,
  active,
  speed = 14,
}: {
  text: string;
  active: boolean;
  speed?: number;
}) {
  const [chars, setChars] = useState(active ? 0 : text.length);
  const done = chars >= text.length;

  useEffect(() => {
    if (!active) {
      setChars(text.length);
      return;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setChars(text.length);
      return;
    }
    setChars(0);
    const id = setInterval(() => {
      setChars((c) => {
        if (c >= text.length) {
          clearInterval(id);
          return c;
        }
        return c + 1;
      });
    }, speed);
    return () => clearInterval(id);
  }, [text, active, speed]);

  return (
    <>
      {text.slice(0, chars)}
      {!done && <span className="typed-caret" aria-hidden />}
    </>
  );
}
