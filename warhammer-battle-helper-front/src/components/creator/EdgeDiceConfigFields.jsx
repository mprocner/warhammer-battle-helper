import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  DICE_MODE_FORMULA,
  DICE_MODE_TENS,
  EDGE_DICE_CAP,
  clampEdgeDiceMax,
} from '../../systems/custom/modifierConfig';

const MODE_HINTS = {
  [DICE_MODE_FORMULA]: 'creator.modifier.hintDiceFormula',
  [DICE_MODE_TENS]: 'creator.modifier.hintDiceTens',
};

// The dice half of the modifier card: how extra dice roll and how many the player may pick.
// The maxima are single digits with no minus sign, so they clamp on every keystroke — unlike the
// numeric limits in ModifierConfigBuilder, there is no half-typed value to protect.
function EdgeDiceConfigFields({ cfg, up }) {
  const { t } = useTranslation();

  return (
    <>
      <div className="mcb__field">
        <label className="mcb__label" htmlFor="mcb-dice-mode">{t('creator.modifier.diceMode')}</label>
        <select
          id="mcb-dice-mode"
          data-testid="mcb-dice-mode"
          className="mcb__select"
          value={cfg.diceMode}
          onChange={e => up({ diceMode: e.target.value })}
        >
          <option value={DICE_MODE_FORMULA}>{t('creator.modifier.diceModeFormula')}</option>
          <option value={DICE_MODE_TENS}>{t('creator.modifier.diceModeTens')}</option>
        </select>
        <div className="mcb__hint">{t(MODE_HINTS[cfg.diceMode] || MODE_HINTS[DICE_MODE_FORMULA])}</div>
      </div>

      <div className="mcb__limits">
        <div className="mcb__limit">
          <label className="mcb__label" htmlFor="mcb-max-edge">{t('creator.modifier.maxEdge')}</label>
          <input id="mcb-max-edge" data-testid="mcb-max-edge" type="number" min={0} max={EDGE_DICE_CAP}
                 value={cfg.maxEdge}
                 onChange={e => up({ maxEdge: clampEdgeDiceMax(e.target.value) })} />
        </div>
        <div className="mcb__limit">
          <label className="mcb__label" htmlFor="mcb-max-setback">{t('creator.modifier.maxSetback')}</label>
          <input id="mcb-max-setback" data-testid="mcb-max-setback" type="number" min={0} max={EDGE_DICE_CAP}
                 value={cfg.maxSetback}
                 onChange={e => up({ maxSetback: clampEdgeDiceMax(e.target.value) })} />
        </div>
      </div>
      <div className="mcb__hint">{t('creator.modifier.diceHint')}</div>
    </>
  );
}

export default EdgeDiceConfigFields;
