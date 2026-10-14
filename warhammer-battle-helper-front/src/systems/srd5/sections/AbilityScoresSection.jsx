import React from 'react';
import { useTranslation } from 'react-i18next';
import Srd5AdvantageOverlay from '../Srd5AdvantageOverlay';

const ABILITIES = [
  { key: 'str', labelKey: 'srd.str' },
  { key: 'dex', labelKey: 'srd.dex' },
  { key: 'con', labelKey: 'srd.con' },
  { key: 'int', labelKey: 'srd.int' },
  { key: 'wis', labelKey: 'srd.wis' },
  { key: 'cha', labelKey: 'srd.cha' },
];

function abilityMod(score) {
  const diff = score - 10;
  return diff >= 0 ? Math.floor(diff / 2) : Math.ceil(diff / 2);
}

function formatMod(mod) {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

function AbilityScoresSection({ abilities, onAbilityChange, onRollAbility, gameId }) {
  const { t } = useTranslation();

  return (
    <div className="srd-ability-grid">
      {ABILITIES.map(({ key, labelKey }) => {
        const score = abilities[key] ?? 10;
        const mod = abilityMod(score);
        return (
          <div key={key} className="srd-ability-score">
            <div className="srd-ability-score__label">{t(labelKey)}</div>
            <Srd5AdvantageOverlay onAdvRoll={(d, t) => onRollAbility && onRollAbility(key, d, t)} disabled={!gameId} showDC>
              <button className="srd-ability-score__mod-btn" title={`Roll ${t(labelKey)} check`}>
                <span className="srd-ability-score__mod">{formatMod(mod)}</span>
              </button>
            </Srd5AdvantageOverlay>
            <input
              type="number"
              className="srd-ability-score__value"
              min={1}
              max={30}
              value={score}
              onChange={e => onAbilityChange(key, parseInt(e.target.value) || 10)}
              onClick={e => e.stopPropagation()}
            />
          </div>
        );
      })}
    </div>
  );
}

export default AbilityScoresSection;
