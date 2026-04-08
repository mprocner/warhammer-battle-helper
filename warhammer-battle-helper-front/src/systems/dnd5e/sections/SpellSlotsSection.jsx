import React from 'react';
import { useTranslation } from 'react-i18next';

const SPELL_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

function SpellSlotsSection({ spellSlots, spellcastingAbility, onSpellSlotChange, onSpellcastingAbilityChange }) {
  const { t } = useTranslation();

  const getSlot = (level) => {
    return spellSlots?.find(s => s.level === level) || { level, total: 0, used: 0 };
  };

  return (
    <div className="dnd-section">
      <h4 className="dnd-section-title">{t('dnd.spellcasting')}</h4>
      <div className="dnd-spell-ability-row">
        <label>{t('dnd.spellcastingAbility')}</label>
        <select
          value={spellcastingAbility || 'int'}
          onChange={e => onSpellcastingAbilityChange(e.target.value)}
          className="dnd-spell-ability-select"
        >
          {['str', 'dex', 'con', 'int', 'wis', 'cha'].map(a => (
            <option key={a} value={a}>{a.toUpperCase()}</option>
          ))}
        </select>
      </div>
      <div className="dnd-spell-slots">
        {SPELL_LEVELS.map(level => {
          const slot = getSlot(level);
          return (
            <div key={level} className="dnd-spell-slot">
              <div className="dnd-spell-slot__label">{t('dnd.spellLevel', { level })}</div>
              <div className="dnd-spell-slot__inputs">
                <input
                  type="number"
                  className="dnd-spell-slot__input"
                  min={0}
                  max={slot.total || 0}
                  value={slot.used ?? 0}
                  onChange={e => onSpellSlotChange(level, 'used', parseInt(e.target.value) || 0)}
                  title={t('dnd.used')}
                />
                <span>/</span>
                <input
                  type="number"
                  className="dnd-spell-slot__input"
                  min={0}
                  value={slot.total ?? 0}
                  onChange={e => onSpellSlotChange(level, 'total', parseInt(e.target.value) || 0)}
                  title={t('dnd.total')}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default SpellSlotsSection;
