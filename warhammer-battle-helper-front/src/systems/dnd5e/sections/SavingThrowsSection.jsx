import React from 'react';
import { useTranslation } from 'react-i18next';
import DnD5eAdvantageOverlay from '../DnD5eAdvantageOverlay';

const SAVES = [
  { key: 'str', labelKey: 'dnd.strength' },
  { key: 'dex', labelKey: 'dnd.dexterity' },
  { key: 'con', labelKey: 'dnd.constitution' },
  { key: 'int', labelKey: 'dnd.intelligence' },
  { key: 'wis', labelKey: 'dnd.wisdom' },
  { key: 'cha', labelKey: 'dnd.charisma' },
];

function formatMod(mod) {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

function SavingThrowsSection({ saveProfs, derived, onToggleSaveProf, onRollSave, gameId }) {
  const { t } = useTranslation();
  const saveTotals = derived?.savingThrows || {};

  return (
    <div className="dnd-section">
      <h4 className="dnd-section-title">{t('dnd.savingThrows')}</h4>
      <div className="dnd-save-list">
        {SAVES.map(({ key, labelKey }) => {
          const isProficient = saveProfs?.[key] ?? false;
          const total = saveTotals[key] ?? 0;
          return (
            <div key={key} className="dnd-skill-row">
              <button
                className={`dnd-skill-row__prof-dot ${isProficient ? 'dnd-skill-row__prof-dot--proficient' : ''}`}
                onClick={() => onToggleSaveProf(key)}
                title={isProficient ? t('dnd.proficient') : ''}
              />
              <DnD5eAdvantageOverlay onAdvRoll={(d, t) => onRollSave && onRollSave(key, d, t)} disabled={!gameId} showDC>
                <span className="dnd-skill-row__name">{t(labelKey)}</span>
              </DnD5eAdvantageOverlay>
              <span className={`dnd-skill-row__value ${isProficient ? 'dnd-skill-row__value--proficient' : ''}`}>
                {formatMod(total)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default SavingThrowsSection;
