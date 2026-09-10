import { useCallback, useEffect, useRef, useState } from 'react';
import { stepsForRole, isRevealSatisfied } from './tourSteps';

export const seenKey = (role) => `tutorialSeen:${role}`;

const readSeen = (role) => {
  try {
    return localStorage.getItem(seenKey(role)) !== null;
  } catch {
    return false; // prywatne okno / zablokowane storage — pokaż samouczek, nic nie psuje
  }
};

const writeSeen = (role) => {
  try {
    localStorage.setItem(seenKey(role), '1');
  } catch {
    /* brak zapisu to jedynie ponowny samouczek następnym razem */
  }
};

const defaultQueryTarget = (selector) => document.querySelector(selector);

export function useGameTour({ role, panels = {}, onReveal, queryTarget = defaultQueryTarget, screenReady = true }) {
  const [steps, setSteps] = useState([]);
  const [stepIndex, setStepIndex] = useState(null);
  const [pending, setPending] = useState(null);
  const autoStarted = useRef(false);

  const finish = useCallback(() => {
    setStepIndex(null);
    setPending(null);
    if (role) writeSeen(role);
  }, [role]);

  // goTo dostaje listę jawnie, bo start() woła je zanim setSteps zdąży się scommitować.
  const goToIn = useCallback((index, list) => {
    if (index < 0) return;
    if (index >= list.length) {
      finish();
      return;
    }
    onReveal(list[index]);
    setPending(index);
  }, [finish, onReveal]);

  // Zwraca, czy faktycznie wystartował — wywołanie automatyczne latchuje się
  // tylko na sukcesie, żeby jeden nieudany start (brak żywej kotwicy) nie
  // zablokował samouczka na stałe (patrz efekt auto-startu niżej).
  const start = useCallback(() => {
    if (!role) return false;
    const live = stepsForRole(role).filter(step => queryTarget(step.target));
    if (live.length === 0) return false;
    setSteps(live);
    goToIn(0, live);
    return true;
  }, [role, queryTarget, goToIn]);

  const goTo = useCallback((index) => goToIn(index, steps), [goToIn, steps]);

  // Krok staje się bieżący dopiero gdy panel z jego kotwicą jest naprawdę odsłonięty.
  // Warunek stoi na stanie paneli, nie na timerze — nie ma czego się ścigać.
  useEffect(() => {
    if (pending === null) return;
    const step = steps[pending];
    if (!step || !isRevealSatisfied(step, panels)) return;
    setStepIndex(pending);
    setPending(null);
  }, [pending, steps, panels]);

  // Auto-start czeka na oba warunki: rolę i sygnał gotowości ekranu. Bez tego
  // drugiego auto-start łapie snapshot kotwic w chwili montowania GameTour —
  // a DndContext w tym momencie renderuje jeszcze placeholder ładowania (patrz
  // komentarz przy fetchCharacters), więc na ekranie są tylko kotwice, które
  // RightPanel montuje samodzielnie. Manualne wywołanie start() (przycisk "?")
  // celowo omija ten warunek — wtedy fetch dawno się skończył.
  useEffect(() => {
    if (!role || !screenReady || autoStarted.current) return;
    if (readSeen(role)) {
      autoStarted.current = true;
      return;
    }
    if (start()) autoStarted.current = true;
  }, [role, screenReady, start]);

  return {
    steps,
    stepIndex,
    running: stepIndex !== null,
    start,
    goTo,
    finish,
  };
}
