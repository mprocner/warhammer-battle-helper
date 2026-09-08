import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import CasinoIcon from '@mui/icons-material/Casino';
import ModifierPresetRow from './ModifierPresetRow';
import { clampModifier } from './modifierConfig';

// Pytanie o modyfikator przed rzutem. Jedna kopia dla obu kart customowych — pełnego popupu
// (CharacterSheet) i panelu postaci na siatce (CharacterDetails), które wcześniej trzymały ten
// sam markup osobno.
//
// Wartość żyje w stanie jako surowy string z inputu, nie jako number: typowanie "-20" przechodzi
// przez stan "-", którego Number() nie umie, a użytkownik nie może stracić minusa w połowie
// wpisywania. Na liczbę i w granice konfiguracji zamienia ją clampModifier dopiero przy
// zatwierdzeniu.
function RollModifierOverlay({ label, config, onConfirm, onCancel }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('0');

  const confirm = (value) => onConfirm(clampModifier(value, config));
  const hasLimits = Boolean(config.min || config.max);

  return (
    <div className="custom-roll-overlay">
      <div className="custom-roll-overlay__backdrop" onClick={onCancel} />
      <div className="custom-roll-overlay__card">
        <div className="custom-roll-overlay__title">
          {t('combat.rollFor')}: <strong>{label}</strong>
        </div>

        <ModifierPresetRow presets={config.presets} onPick={confirm} />

        <div className="custom-roll-overlay__row">
          <label className="custom-roll-overlay__label" htmlFor="roll-modifier-input">
            {t('combat.modifier')}
          </label>
          <input
            id="roll-modifier-input"
            type="number"
            className="custom-roll-overlay__input"
            value={draft}
            step={config.step}
            min={hasLimits ? config.min : undefined}
            max={hasLimits ? config.max : undefined}
            onChange={e => setDraft(e.target.value)}
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter') confirm(draft);
              if (e.key === 'Escape') onCancel();
            }}
          />
        </div>

        <div className="custom-roll-overlay__actions">
          <button type="button" className="custom-roll-overlay__btn--cancel" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button type="button" className="custom-roll-overlay__btn--roll" onClick={() => confirm(draft)}>
            <CasinoIcon style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 4 }} />
            {t('combat.roll')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default RollModifierOverlay;
