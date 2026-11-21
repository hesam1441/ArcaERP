import { useDeferredValue, useEffect, useRef, useState } from "react";

/** Echo typing immediately; let expensive filtering yield to input, without a
 * fixed timer or allowing an older parent echo to replace newer keystrokes. */
export function useResponsiveText(value: string, onCommit: (value: string) => void) {
  const [text, setText] = useState(value);
  const lastSent = useRef(value);
  const deferred = useDeferredValue(text);
  useEffect(() => {
    // A new external value (reset/navigation) takes precedence over an old echo.
    if (value !== lastSent.current || deferred === value) return;
    lastSent.current = deferred;
    onCommit(deferred);
  }, [deferred, value, onCommit]);
  useEffect(() => {
    if (value !== lastSent.current) {
      lastSent.current = value;
      setText(value);
    }
  }, [value]);
  return [text, setText] as const;
}
