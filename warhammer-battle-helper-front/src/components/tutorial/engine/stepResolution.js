// Silnik nie zna nazw kroków. Krok deklaruje, po czym wariantuje, a tutaj
// zamieniamy tę deklarację na przyrostek klucza tłumaczenia.
export const VARIANT_AXES = {
  // Który selektor z listy kotwic trafił — tak odróżniamy pusty stan od pełnego,
  // pytając DOM zamiast danych aplikacji.
  byTarget: (ctx) => String(ctx.targetIndex),
  byRole: (ctx) => ctx.role,
  byScheme: (ctx) => (ctx.controlScheme === 'classic' ? 'classic' : 'modern'),
};

export const resolveTarget = (step, queryTarget) => {
  const targets = Array.isArray(step.target) ? step.target : [step.target];
  for (let index = 0; index < targets.length; index += 1) {
    if (queryTarget(targets[index])) return { selector: targets[index], index };
  }
  return null;
};

export const titleKeyFor = (step, tourId) => `tutorial.${tourId}.${step.id}.title`;

export const bodyKeyFor = (step, tourId, ctx) => {
  const base = `tutorial.${tourId}.${step.id}.body`;
  // Oś, której nie ma w VARIANT_AXES, to literówka w pliku tury — pomijamy ją
  // przy budowaniu klucza zamiast wywalić render całej sesji gry bare
  // TypeError-em (patrz tours/index.test.js: sprawdza to na poziomie rejestru).
  const suffixes = (step.variants || [])
    .filter(axis => Object.prototype.hasOwnProperty.call(VARIANT_AXES, axis))
    .map(axis => VARIANT_AXES[axis](ctx));
  return [base, ...suffixes].join('.');
};

// Krok może wymagać, żeby panel z jego kotwicą był naprawdę odsłonięty —
// deklaruje to polem `reveal`, a stan paneli przychodzi z ekranu.
const REVEAL_SATISFIED = {
  left: (panels) => !panels.leftHidden,
  right: (panels) => !panels.rightHidden,
  top: (panels) => !panels.topCollapsed,
};

export const isRevealSatisfied = (step, panels) =>
  step.reveal ? REVEAL_SATISFIED[step.reveal](panels) : true;
