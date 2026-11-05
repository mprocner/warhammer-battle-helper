import { useState, useCallback, useMemo, useRef } from 'react';
import { readModifierConfig } from './modifierConfig';

// useRollPrompt trzyma jedyny stan, jakiego potrzebuje pytanie o modyfikator: co rzucamy.
// Gdy szablon nie ma włączonego modyfikatora, promptRoll wykonuje rzut od razu — dzięki temu
// żaden komponent karty nie musi powtarzać tego sprawdzenia ani pamiętać o zerowaniu wartości
// po rzucie (to właśnie było zduplikowane w CharacterSheet i CharacterDetails).
//
// onRoll(request, modifier) dostaje request nietknięty, więc hook nie wie nic o tym, czy rzut
// idzie na umiejętność, czy na broń — dyspozycją zajmuje się wołający.
export function useRollPrompt(template, onRoll) {
  const [pending, setPending] = useState(null);
  const [pendingPos, setPendingPos] = useState(null);
  const lastClickRef = useRef(null);
  const modifierConfig = useMemo(() => readModifierConfig(template), [template]);

  // trackClick records where a roll was clicked so the dice column can open under the cursor.
  // It is attached as a React onClickCapture on the card root — not a document listener — and
  // only records, never stops the event. Keyboard activation has detail 0 and no meaningful
  // clientX/Y, so the clicked element's centre stands in.
  const trackClick = useCallback((e) => {
    if (e.detail > 0) {
      lastClickRef.current = { x: e.clientX, y: e.clientY };
      return;
    }
    const r = e.target.getBoundingClientRect();
    lastClickRef.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, []);

  const promptRoll = useCallback((request) => {
    if (!modifierConfig) {
      onRoll(request, 0);
      return;
    }
    setPending(request);
    setPendingPos(lastClickRef.current);
  }, [modifierConfig, onRoll]);

  const cancelRoll = useCallback(() => {
    setPending(null);
    setPendingPos(null);
  }, []);

  const confirmRoll = useCallback((modifier) => {
    if (!pending) return;
    onRoll(pending, modifier);
    setPending(null);
    setPendingPos(null);
  }, [pending, onRoll]);

  return { modifierConfig, pending, pendingPos, promptRoll, cancelRoll, confirmRoll, trackClick };
}
