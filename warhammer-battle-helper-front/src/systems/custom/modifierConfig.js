// Nazwy targetów modyfikatora. MUSZĄ być identyczne ze stałymi w
// warhammer-battle-helper-backend/internal/systems/custom/modifier.go — backend rozstrzyga
// rzut po tym samym stringu, który tu wybiera MG w kreatorze.
export const MOD_TARGET_ROLL = 'roll';
export const MOD_TARGET_THRESHOLD = 'threshold';
export const MOD_TARGET_DICE_COUNT = 'dice_count';
export const MOD_TARGET_SUCCESS_THRESHOLD = 'success_threshold';

export const DEFAULT_MODIFIER_CONFIG = {
  enabled: false,
  traditionalTarget: MOD_TARGET_ROLL,
  poolTarget: MOD_TARGET_DICE_COUNT,
  step: 1,
  min: 0,
  max: 0,
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
