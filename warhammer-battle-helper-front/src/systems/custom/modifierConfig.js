// Nazwy targetów modyfikatora. MUSZĄ być identyczne ze stałymi w
// warhammer-battle-helper-backend/internal/systems/custom/modifier.go — backend rozstrzyga
// rzut po tym samym stringu, który tu wybiera MG w kreatorze.
export const MOD_TARGET_ROLL = 'roll';
export const MOD_TARGET_THRESHOLD = 'threshold';
export const MOD_TARGET_DICE_COUNT = 'dice_count';
export const MOD_TARGET_SUCCESS_THRESHOLD = 'success_threshold';

// Modifier kinds and edge-dice modes — the same strings as modifier.go.
export const MOD_KIND_NUMBER = 'number';
export const MOD_KIND_DICE = 'dice';
export const DICE_MODE_FORMULA = 'formula';
export const DICE_MODE_TENS = 'tens';

// Upper bound for either maximum in the creator. The server enforces the same cap (maxEdgeDice).
export const EDGE_DICE_CAP = 5;

export const DEFAULT_MODIFIER_CONFIG = {
  enabled: false,
  traditionalTarget: MOD_TARGET_ROLL,
  poolTarget: MOD_TARGET_DICE_COUNT,
  step: 1,
  min: 0,
  max: 0,
  // Defaults must be what Go omits (0 / empty), or a saved 0 would read back as something else.
  kind: MOD_KIND_NUMBER,
  diceMode: DICE_MODE_FORMULA,
  maxEdge: 0,
  maxSetback: 0,
  presets: [],
};

// readModifierConfig zwraca znormalizowaną konfigurację modyfikatora albo null, gdy karta go
// nie używa. null zamiast obiektu z enabled:false po to, żeby wywołujący sprawdzał jedną rzecz:
// "brak konfiguracji" i "wyłączony" znaczą dla UI dokładnie to samo.
export function readModifierConfig(template) {
  const cfg = template?.settings?.modifier;
  if (!cfg || !cfg.enabled) return null;
  return {
    ...DEFAULT_MODIFIER_CONFIG,
    ...cfg,
    kind: cfg.kind === MOD_KIND_DICE ? MOD_KIND_DICE : MOD_KIND_NUMBER,
    diceMode: cfg.diceMode === DICE_MODE_TENS ? DICE_MODE_TENS : DICE_MODE_FORMULA,
    maxEdge: clampEdgeDiceMax(cfg.maxEdge),
    maxSetback: clampEdgeDiceMax(cfg.maxSetback),
    // Input z step === 0 nie reaguje na strzałki, a 0 to dokładnie to, co przychodzi z Go dla
    // nieustawionego pola (omitempty) — naprawiamy tu, nie w każdym miejscu użycia.
    step: cfg.step > 0 ? cfg.step : 1,
    presets: Array.isArray(cfg.presets) ? cfg.presets : [],
  };
}

// clampModifier trzyma wartość w granicach z konfiguracji. min === 0 && max === 0 znaczy
// "bez granic" — ta sama umowa co clampModifier w Go, żeby UI i serwer nie rozjechały się
// w tym, co jest wartością dopuszczalną.
export function clampModifier(value, cfg) {
  const parsed = parseInt(value, 10);
  const v = Number.isNaN(parsed) ? 0 : parsed;
  if (!cfg || (!cfg.min && !cfg.max)) return v;
  if (v < cfg.min) return cfg.min;
  if (v > cfg.max) return cfg.max;
  return v;
}

// formatModifier daje podpisaną etykietę do chipów presetów: plus dostaje znak, zero i minus
// zostają takie, jakie są.
export function formatModifier(value) {
  return value > 0 ? `+${value}` : String(value);
}

// clampEdgeDiceMax bounds a maximum to [0, EDGE_DICE_CAP]; anything unparsable is 0 (side off).
export function clampEdgeDiceMax(value) {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return 0;
  return Math.min(Math.max(parsed, 0), EDGE_DICE_CAP);
}

// edgeDiceButtons lists the dice column top to bottom: +maxEdge … +1, 0, -1 … -maxSetback.
// The 0 button is always there — it is the plain roll.
export function edgeDiceButtons(cfg) {
  const hi = clampEdgeDiceMax(cfg?.maxEdge);
  const lo = clampEdgeDiceMax(cfg?.maxSetback);
  const out = [];
  for (let d = hi; d >= -lo; d -= 1) {
    out.push({ diceMod: d, type: d > 0 ? 'edge' : d < 0 ? 'setback' : 'neutral' });
  }
  return out;
}
