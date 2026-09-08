import { useState, useCallback, useMemo } from 'react';
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
  const modifierConfig = useMemo(() => readModifierConfig(template), [template]);

  const promptRoll = useCallback((request) => {
    if (!modifierConfig) {
      onRoll(request, 0);
      return;
    }
    setPending(request);
  }, [modifierConfig, onRoll]);

  const cancelRoll = useCallback(() => setPending(null), []);

  const confirmRoll = useCallback((modifier) => {
    if (!pending) return;
    onRoll(pending, modifier);
    setPending(null);
  }, [pending, onRoll]);

  return { modifierConfig, pending, promptRoll, cancelRoll, confirmRoll };
}
