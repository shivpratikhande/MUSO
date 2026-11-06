'use client';

import { useEffect, useRef, useState } from 'react';
import { TOAST_EVENT } from '@/lib/toast';

/** Toast state for a component's own toast area (e.g. inside the phone mockup). */
export function useToast() {
  const [message, setMessage] = useState('');
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = (msg: string) => {
    setMessage(msg);
    setVisible(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(false), 2200);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  return { message, visible, show };
}

export function Toast() {
  const { message, visible, show } = useToast();
  useEffect(() => {
    const onToast = (e: Event) => show((e as CustomEvent<string>).detail);
    window.addEventListener(TOAST_EVENT, onToast);
    return () => window.removeEventListener(TOAST_EVENT, onToast);
    // `show` only touches state setters and a ref, so subscribing once is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className={`toast${visible ? ' show' : ''}`} role="status" aria-live="polite">
      {message}
    </div>
  );
}
