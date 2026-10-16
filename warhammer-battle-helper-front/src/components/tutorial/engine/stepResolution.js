// Silnik nie zna nazw kroków. Krok deklaruje, po czym wariantuje, a tutaj
// zamieniamy tę deklarację na przyrostek klucza tłumaczenia.
export const VARIANT_AXES = {
  // Który selektor z listy kotwic trafił — tak odróżniamy pusty stan od pełnego,
  // pytając DOM zamiast danych aplikacji.
  byTarget: (ctx) => String(ctx.targetIndex),
  byRole: (ctx) => ctx.role,
  byScheme: (ctx) => (ctx.controlScheme === 'classic' ? 'classic' : 'modern'),
  // Which field type the creator's property panel is showing ('section' for a section).
  byFieldType: (ctx) => ctx.fieldType,
};

export const resolveTarget = (step, queryTarget) => {
  const targets = Array.isArray(step.target) ? step.target : [step.target];
  for (let index = 0; index < targets.length; index += 1) {
    if (queryTarget(targets[index])) return { selector: targets[index], index };
  }
  return null;
};

export const titleKeyFor = (step, tourId) => `tutorial.${tourId}.${step.id}.title`;

// bodyKeysFor lists the keys a step's body may live under, most specific first; the renderer
// passes the list to t(), which takes the first that exists. A step with `variantFallback`
// ends the list with `<base>.default`, so a variant written for only some contexts (e.g. a few
// field types) falls back to general text instead of showing a raw key.
export const bodyKeysFor = (step, tourId, ctx) => {
  const base = `tutorial.${tourId}.${step.id}.body`;
  // An axis missing from VARIANT_AXES is a typo in the tour file — skip it rather than crash the
  // render (tours/index.test.js catches it at registry level).
  const suffixes = (step.variants || [])
    .filter(axis => Object.prototype.hasOwnProperty.call(VARIANT_AXES, axis))
    .map(axis => VARIANT_AXES[axis](ctx));
  const keys = [[base, ...suffixes].join('.')];
  if (step.variantFallback) keys.push(`${base}.default`);
  return keys;
};

export const bodyKeyFor = (step, tourId, ctx) => bodyKeysFor(step, tourId, ctx)[0];

// Krok może wymagać, żeby panel z jego kotwicą był naprawdę odsłonięty —
// deklaruje to polem `reveal`, a stan paneli przychodzi z ekranu.
const REVEAL_SATISFIED = {
  left: (panels) => !panels.leftHidden,
  right: (panels) => !panels.rightHidden,
  top: (panels) => !panels.topCollapsed,
};

export const isRevealSatisfied = (step, panels) =>
  step.reveal ? REVEAL_SATISFIED[step.reveal](panels) : true;
