import React from 'react';
import { useTranslation } from 'react-i18next';
import DnD5eAdvantageOverlay from '../DnD5eAdvantageOverlay';

const ABILITIES = [
  { key: 'str', labelKey: 'dnd.str' },
  { key: 'dex', labelKey: 'dnd.dex' },
  { key: 'con', labelKey: 'dnd.con' },
  { key: 'int', labelKey: 'dnd.int' },
  { key: 'wis', labelKey: 'dnd.wis' },
  { key: 'cha', labelKey: 'dnd.cha' },
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
    <div className="dnd-ability-grid">
      {ABILITIES.map(({ key, labelKey }) => {
        const score = abilities[key] ?? 10;
        const mod = abilityMod(score);
        return (
          <div key={key} className="dnd-ability-score">
            <div className="dnd-ability-score__label">{t(labelKey)}</div>
            <DnD5eAdvantageOverlay onAdvRoll={(d, t) => onRollAbility && onRollAbility(key, d, t)} disabled={!gameId} showDC>
              <button className="dnd-ability-score__mod-btn" title={`Roll ${t(labelKey)} check`}>
                <span className="dnd-ability-score__mod">{formatMod(mod)}</span>
              </button>
            </DnD5eAdvantageOverlay>
            <input
              type="number"
              className="dnd-ability-score__value"
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
