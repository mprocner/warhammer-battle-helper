import React from 'react';
import { formatModifier } from './modifierConfig';

// Rząd chipów szybkiego wyboru modyfikatora. Bezstanowy — klik oddaje wartość w górę, a overlay
// decyduje, co z nią zrobić. Etykiety pisze MG w kreatorze, więc nie idą przez i18n.
//
// Klucz to indeks: lista nie ma id (backendowy models.ModifierPreset trzyma tylko value+label)
// i nigdy nie jest tu przestawiana — reorder byłby zmianą po stronie kreatora, nie tu.
function ModifierPresetRow({ presets, onPick }) {
  if (!presets || presets.length === 0) return null;

  return (
    <div className="custom-roll-overlay__presets">
      {presets.map((preset, idx) => {
        const tone = preset.value > 0 ? ' custom-roll-overlay__preset--plus'
          : preset.value < 0 ? ' custom-roll-overlay__preset--minus' : '';
        return (
          <button
            key={idx}
            type="button"
            className={`custom-roll-overlay__preset${tone}`}
            onClick={() => onPick(preset.value)}
          >
            <span className="custom-roll-overlay__preset-value">{formatModifier(preset.value)}</span>
            {preset.label && <span className="custom-roll-overlay__preset-label">{preset.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

export default ModifierPresetRow;
