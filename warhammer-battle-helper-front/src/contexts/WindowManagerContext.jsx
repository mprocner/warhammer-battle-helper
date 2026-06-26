import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';

/**
 * Centralny rejestr otwartych okien (popupów) w sesji gry.
 *
 * Rozdzielamy dwie kolejności:
 *  - `windows` — kolejność WYŚWIETLANIA na listwie. Ustalana przez kolejność
 *    otwierania; nie zmienia się przy fokusie. Użytkownik może ją zmieniać
 *    ręcznie (drag & drop) przez reorderWindows.
 *  - `stackOrder` — kolejność z-index (fokusu) trzymana osobno w pamięci.
 *    Ostatni id = okno na wierzchu. focusWindow przenosi id na koniec.
 *
 * Deskryptor okna: { id, kind: 'handout'|'note'|'characterSheet', title, hidden }
 * Callback onClose przechowujemy poza stanem (w ref-mapie), żeby zmiana
 * funkcji nie powodowała przebudowy listy.
 */

const WindowManagerContext = createContext(null);

const Z_BASE = 1500;

export function WindowManagerProvider({ children }) {
  const [windows, setWindows] = useState([]);       // kolejność listwy
  const [stackOrder, setStackOrder] = useState([]); // kolejność z-index (fokus)
  const onCloseMap = useRef(new Map());

  // Dodaj okno (jeśli nowe) lub zaktualizuj tytuł/typ (jeśli już istnieje).
  // Nowe okno trafia na koniec listwy (kolejność otwierania) i na wierzch stosu.
  const registerWindow = useCallback(({ id, kind, title, onClose }) => {
    if (onClose) onCloseMap.current.set(id, onClose);
    setWindows(prev => {
      const idx = prev.findIndex(w => w.id === id);
      if (idx === -1) {
        return [...prev, { id, kind, title, hidden: false }];
      }
      const cur = prev[idx];
      if (cur.kind === kind && cur.title === title) return prev;
      const next = [...prev];
      next[idx] = { ...cur, kind, title };
      return next;
    });
    setStackOrder(prev => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const unregisterWindow = useCallback((id) => {
    onCloseMap.current.delete(id);
    setWindows(prev => (prev.some(w => w.id === id) ? prev.filter(w => w.id !== id) : prev));
    setStackOrder(prev => (prev.includes(id) ? prev.filter(x => x !== id) : prev));
  }, []);

  // Podnieś okno na wierzch (tylko z-index) i pokaż je. Kolejność listwy bez zmian.
  const focusWindow = useCallback((id) => {
    setStackOrder(prev => {
      if (!prev.includes(id)) return [...prev, id];
      if (prev[prev.length - 1] === id) return prev;
      return [...prev.filter(x => x !== id), id];
    });
    setWindows(prev => prev.map(w => (w.id === id && w.hidden ? { ...w, hidden: false } : w)));
  }, []);

  const toggleHidden = useCallback((id) => {
    setWindows(prev => prev.map(w => (w.id === id ? { ...w, hidden: !w.hidden } : w)));
  }, []);

  // Zmiana kolejności listwy (drag & drop): przenieś draggedId na pozycję targetId.
  const reorderWindows = useCallback((draggedId, targetId) => {
    if (draggedId === targetId) return;
    setWindows(prev => {
      const from = prev.findIndex(w => w.id === draggedId);
      const to = prev.findIndex(w => w.id === targetId);
      if (from === -1 || to === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  // Zamknij okno — woła onClose właściciela, który przestaje renderować
  // (a jego cleanup wywoła unregisterWindow). Fallback: usuń ręcznie.
  const closeWindow = useCallback((id) => {
    const onClose = onCloseMap.current.get(id);
    if (onClose) onClose();
    else unregisterWindow(id);
  }, [unregisterWindow]);

  const value = useMemo(() => ({
    windows,
    stackOrder,
    registerWindow,
    unregisterWindow,
    focusWindow,
    toggleHidden,
    reorderWindows,
    closeWindow,
  }), [windows, stackOrder, registerWindow, unregisterWindow, focusWindow, toggleHidden, reorderWindows, closeWindow]);

  return (
    <WindowManagerContext.Provider value={value}>
      {children}
    </WindowManagerContext.Provider>
  );
}

export function useWindowManager() {
  const ctx = useContext(WindowManagerContext);
  if (!ctx) {
    throw new Error('useWindowManager must be used within a WindowManagerProvider');
  }
  return ctx;
}

/**
 * Hook używany przez sam komponent okna. Rejestruje okno na czas życia
 * komponentu i zwraca jego stan z menedżera (hidden, zIndex z-osobnego stosu,
 * kaskadowy stackIndex z kolejności listwy) oraz funkcję focus().
 */
export function useManagedWindow({ id, kind, title, onClose }) {
  const { windows, stackOrder, registerWindow, unregisterWindow, focusWindow } = useWindowManager();

  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // Rejestracja przy mount, wyrejestrowanie przy unmount. Świadomie BEZ
  // title w zależnościach — inaczej każda zmiana tytułu odmontowywałaby
  // i ponownie dodawała okno. Brak id → okno nie trafia na listwę (np. minigry).
  useEffect(() => {
    if (!id) return undefined;
    registerWindow({ id, kind, title, onClose: () => onCloseRef.current?.() });
    return () => unregisterWindow(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, kind]);

  // Aktualizacja tytułu w miejscu.
  useEffect(() => {
    if (!id) return;
    registerWindow({ id, kind, title, onClose: () => onCloseRef.current?.() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title]);

  const listIndex = windows.findIndex(w => w.id === id);
  const self = listIndex === -1 ? null : windows[listIndex];
  const zIndexPos = stackOrder.indexOf(id);
  const focus = useCallback(() => focusWindow(id), [focusWindow, id]);

  return {
    hidden: self?.hidden ?? false,
    zIndex: Z_BASE + (zIndexPos === -1 ? 0 : zIndexPos),
    stackIndex: listIndex === -1 ? 0 : listIndex,
    focus,
  };
}

export default WindowManagerContext;
