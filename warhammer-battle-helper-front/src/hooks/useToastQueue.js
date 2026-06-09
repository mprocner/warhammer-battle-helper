import { useState, useRef, useCallback } from 'react';

let idCounter = 0;

export function useToastQueue({ maxVisible = 4, duration = 5000 } = {}) {
  const [toasts, setToasts] = useState([]);
  const timersRef      = useRef({});
  const remainingRef   = useRef({});
  const startedAtRef   = useRef({});
  const pausedRef      = useRef(false);

  const remove = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    clearTimeout(timersRef.current[id]);
    delete timersRef.current[id];
    delete remainingRef.current[id];
    delete startedAtRef.current[id];
  }, []);

  const startTimer = useCallback((id, ms) => {
    clearTimeout(timersRef.current[id]);
    startedAtRef.current[id] = Date.now();
    remainingRef.current[id] = ms;
    timersRef.current[id] = setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, isExiting: true } : t));
      setTimeout(() => remove(id), 320);
    }, ms);
  }, [remove]);

  const pushToast = useCallback((data) => {
    const id = ++idCounter;
    setToasts(prev => {
      const next = [...prev, { id, data, isExiting: false }];
      if (next.length > maxVisible) {
        const dropped = next[0];
        clearTimeout(timersRef.current[dropped.id]);
        delete timersRef.current[dropped.id];
        delete remainingRef.current[dropped.id];
        delete startedAtRef.current[dropped.id];
        return next.slice(1);
      }
      return next;
    });
    if (!pausedRef.current) {
      startTimer(id, duration);
    } else {
      remainingRef.current[id] = duration;
      startedAtRef.current[id] = Date.now();
    }
  }, [maxVisible, duration, startTimer]);

  const dismissToast = useCallback((id) => {
    clearTimeout(timersRef.current[id]);
    delete timersRef.current[id];
    setToasts(prev => prev.map(t => t.id === id ? { ...t, isExiting: true } : t));
    setTimeout(() => remove(id), 320);
  }, [remove]);

  const pauseAll = useCallback(() => {
    if (pausedRef.current) return;
    pausedRef.current = true;
    const now = Date.now();
    Object.keys(timersRef.current).forEach(idStr => {
      clearTimeout(timersRef.current[idStr]);
      const started  = startedAtRef.current[idStr] || now;
      const original = remainingRef.current[idStr] || 0;
      remainingRef.current[idStr] = Math.max(0, original - (now - started));
    });
    timersRef.current = {};
  }, []);

  const resumeAll = useCallback(() => {
    if (!pausedRef.current) return;
    pausedRef.current = false;
    Object.keys(remainingRef.current).forEach(idStr => {
      if (!timersRef.current[idStr]) {
        startTimer(parseInt(idStr, 10), remainingRef.current[idStr]);
      }
    });
  }, [startTimer]);

  return { toasts, pushToast, dismissToast, pauseAll, resumeAll };
}
