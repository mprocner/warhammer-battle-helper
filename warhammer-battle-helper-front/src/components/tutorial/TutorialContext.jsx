import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

// Kanał niesie WYŁĄCZNIE identyfikator samouczka do uruchomienia. Treść kroków
// płynie rejestrem — inaczej kontekst stałby się drugim źródłem prawdy.
const TutorialContext = createContext({ activeTourId: null, startTour: () => {}, clearTour: () => {} });

export const TutorialProvider = ({ children }) => {
  const [activeTourId, setActiveTourId] = useState(null);
  // Licznik rośnie przy każdym starcie, także tego samego samouczka — dzięki temu
  // ponowne kliknięcie tego samego przycisku uruchamia go od nowa.
  const [startCount, setStartCount] = useState(0);

  const startTour = useCallback((id) => {
    setActiveTourId(id);
    setStartCount(n => n + 1);
  }, []);

  const clearTour = useCallback(() => setActiveTourId(null), []);

  const value = useMemo(
    () => ({ activeTourId, startCount, startTour, clearTour }),
    [activeTourId, startCount, startTour, clearTour]
  );

  return <TutorialContext.Provider value={value}>{children}</TutorialContext.Provider>;
};

export const useTutorial = () => useContext(TutorialContext);
