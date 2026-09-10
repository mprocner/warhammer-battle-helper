import { useCallback, useEffect, useRef, useState } from 'react';
import { getTour } from '../tours';
import { resolveTarget, isRevealSatisfied } from './stepResolution';

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

export function useGameTour({
  tourId,
  role,
  panels = {},
  onReveal,
  queryTarget = defaultQueryTarget,
  screenReady = true,
  autoStart = true,
  persist = true,
  onFinish,
}) {
  const [steps, setSteps] = useState([]);
  const [stepIndex, setStepIndex] = useState(null);
  const [pending, setPending] = useState(null);
  const autoStarted = useRef(false);

  // onFinish jest jedynym miejscem, w którym silnik zawiadamia świat zewnętrzny
  // o końcu touru — wywoływane niezależnie od tego, KTÓRA droga do niego
  // doprowadziła (Skip/Done, Escape, albo TARGET_NOT_FOUND spychające
  // goTo poza koniec listy kroków — patrz GameTour.jsx). Jeden mechanizm
  // zamiast trzech osobnych wywołań w miejscach, które kończą tour.
  const finish = useCallback(() => {
    setStepIndex(null);
    setPending(null);
    if (persist && role) writeSeen(role);
    if (onFinish) onFinish();
  }, [persist, role, onFinish]);

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
    if (!tourId) return false;
    const tour = getTour(tourId);
    if (!tour) return false;

    // Krok trafia na listę tylko wtedy, gdy jego rola pasuje i któraś z kotwic
    // faktycznie istnieje — zapamiętujemy, która, bo od niej zależy wariant tekstu.
    const live = [];
    tour.steps.forEach(step => {
      if (step.roles && !step.roles.includes(role)) return;
      const hit = resolveTarget(step, queryTarget);
      if (!hit) return;
      live.push({ ...step, resolvedTarget: hit.selector, targetIndex: hit.index });
    });

    if (live.length === 0) return false;
    setSteps(live);
    goToIn(0, live);
    return true;
  }, [tourId, role, queryTarget, goToIn]);

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
    if (!autoStart || !role || !screenReady || autoStarted.current) return;
    if (persist && readSeen(role)) {
      autoStarted.current = true;
      return;
    }
    if (start()) autoStarted.current = true;
  }, [autoStart, persist, role, screenReady, start]);

  return {
    steps,
    stepIndex,
    running: stepIndex !== null,
    start,
    goTo,
    finish,
  };
}
