import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import RestartAltIcon from '@mui/icons-material/RestartAlt';

// Default dice shown under the chat — mirrors DiceRollControls' fallback set.
export const DEFAULT_DICE = [4, 6, 8, 10, 12, 20, 100];
const PRESET_DICE = [4, 6, 8, 10, 12, 20, 100];
const MAX_DICE = 7;
const MAX_SIDES = 1000;

// DiceConfigBuilder lets a GM pick which dice buttons appear under the chat.
// Visual grammar mirrors FormulaBuilder: a track of removable chips, a preset
// row, and a custom-value input. Dice are unique and reordered with arrows.
function DiceConfigBuilder({ dice, onChange }) {
  const { t } = useTranslation();
  const [customDraft, setCustomDraft] = useState('');

  const list = dice || [];
  const isFull = list.length >= MAX_DICE;

  const addDie = (sides) => {
    if (isFull || list.includes(sides)) return;
    onChange([...list, sides]);
  };

  const removeDie = (idx) => onChange(list.filter((_, i) => i !== idx));

  const move = (idx, dir) => {
    const target = idx + dir;
    if (target < 0 || target >= list.length) return;
    const next = [...list];
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  };

  const reset = () => onChange([...DEFAULT_DICE]);

  const parsedCustom = parseInt(customDraft, 10);
  const customValid =
    !isNaN(parsedCustom) &&
    parsedCustom >= 2 &&
    parsedCustom <= MAX_SIDES &&
    !list.includes(parsedCustom) &&
    !isFull;

  const addCustom = () => {
    if (!customValid) return;
    onChange([...list, parsedCustom]);
    setCustomDraft('');
  };

  return (
    <div className="dcb__root">

      {/* ── Active dice track ───────────────────────────────────────────── */}
      <div className="dcb__track">
        <div className="dcb__track-header">
          <span className="dcb__track-label">{t('dice.trackLabel')}</span>
          <button className="dcb__reset" onClick={reset}>
            <RestartAltIcon style={{ fontSize: 14 }} /> {t('dice.resetDefault')}
          </button>
        </div>

        <div className="dcb__track-body">
          {list.length === 0 ? (
            <span className="dcb__track-empty">{t('dice.trackEmpty')}</span>
          ) : list.map((sides, idx) => (
            <div key={`${sides}_${idx}`} className="dcb__chip">
              <button
                className="dcb__chip-move"
                onClick={() => move(idx, -1)}
                disabled={idx === 0}
                title={t('dice.moveLeft')}
                aria-label={t('dice.moveLeft')}
              >
                <ArrowBackIosNewIcon style={{ fontSize: 11 }} />
              </button>
              <span className="dcb__chip-label">{t('dice.label', { sides })}</span>
              <button
                className="dcb__chip-move"
                onClick={() => move(idx, +1)}
                disabled={idx === list.length - 1}
                title={t('dice.moveRight')}
                aria-label={t('dice.moveRight')}
              >
                <ArrowForwardIosIcon style={{ fontSize: 11 }} />
              </button>
              <button
                className="dcb__chip-remove"
                onClick={() => removeDie(idx)}
                title={t('dice.removeDie')}
                aria-label={t('dice.removeDie')}
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        {isFull && (
          <div className="dcb__track-hint">
            {t('dice.maxReachedHint', { count: list.length, max: MAX_DICE })}
          </div>
        )}
      </div>

      {/* ── Presets ─────────────────────────────────────────────────────── */}
      <div className="dcb__section">
        <div className="dcb__section-header">
          <span className="dcb__section-title">{t('dice.presetsLabel')}</span>
        </div>
        <div className="dcb__section-body">
          <div className="dcb__preset-row">
            {PRESET_DICE.map(sides => (
              <button
                key={sides}
                className="dcb__preset-btn"
                onClick={() => addDie(sides)}
                disabled={isFull || list.includes(sides)}
              >
                {t('dice.label', { sides })}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Custom die ──────────────────────────────────────────────────── */}
      <div className="dcb__section">
        <div className="dcb__section-header">
          <span className="dcb__section-title">{t('dice.customLabel')}</span>
        </div>
        <div className="dcb__section-body">
          <div className="dcb__custom-row">
            <span className="dcb__custom-notation">{t('dice.dieNotation')}</span>
            <input
              type="number"
              min={2}
              max={MAX_SIDES}
              className="dcb__custom-input"
              value={customDraft}
              onChange={e => setCustomDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addCustom(); }}
              placeholder="3"
              disabled={isFull}
            />
            <button className="dcb__custom-add" onClick={addCustom} disabled={!customValid}>
              {t('dice.addCustom', { sides: parsedCustom > 0 ? parsedCustom : '' })}
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}

export default DiceConfigBuilder;
