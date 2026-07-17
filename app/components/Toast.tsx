'use client';

import { useEffect, useRef, useState } from 'react';

export type ToastItem = { id: number; kicker: string; message: string };

const TOAST_LIFETIME_MS = 3500;
const TOAST_EXIT_MS = 260;

function Toast({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: number) => void;
}) {
  const [leaving, setLeaving] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Auto-dismiss: start leaving 260ms before removal so the exit animation plays.
  useEffect(() => {
    timersRef.current.push(
      setTimeout(() => setLeaving(true), TOAST_LIFETIME_MS - TOAST_EXIT_MS),
      setTimeout(() => onDismiss(toast.id), TOAST_LIFETIME_MS)
    );

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismissNow = () => {
    if (leaving) return;
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [setTimeout(() => onDismiss(toast.id), TOAST_EXIT_MS)];
    setLeaving(true);
  };

  return (
    <div
      className={leaving ? 'toast leaving' : 'toast'}
      onClick={dismissNow}
      role="status"
    >
      <span className="toast-kicker">{toast.kicker}</span>
      {toast.message}
    </div>
  );
}

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map(toast => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
