import React from 'react';
import { useTranslation } from 'react-i18next';
import Srd5AdvantageOverlay from '../Srd5AdvantageOverlay';

const SAVES = [
  { key: 'str', labelKey: 'srd.strength' },
  { key: 'dex', labelKey: 'srd.dexterity' },
  { key: 'con', labelKey: 'srd.constitution' },
  { key: 'int', labelKey: 'srd.intelligence' },
  { key: 'wis', labelKey: 'srd.wisdom' },
  { key: 'cha', labelKey: 'srd.charisma' },
];

function formatMod(mod) {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

function SavingThrowsSection({ saveProfs, derived, onToggleSaveProf, onRollSave, gameId }) {
  const { t } = useTranslation();
  const saveTotals = derived?.savingThrows || {};

  return (
    <div className="srd-section">
      <h4 className="srd-section-title">{t('srd.savingThrows')}</h4>
      <div className="srd-save-list">
        {SAVES.map(({ key, labelKey }) => {
          const isProficient = saveProfs?.[key] ?? false;
          const total = saveTotals[key] ?? 0;
          return (
            <div key={key} className="srd-skill-row">
              <button
                className={`srd-skill-row__prof-dot ${isProficient ? 'srd-skill-row__prof-dot--proficient' : ''}`}
                onClick={() => onToggleSaveProf(key)}
                title={isProficient ? t('srd.proficient') : ''}
              />
              <Srd5AdvantageOverlay onAdvRoll={(d, t) => onRollSave && onRollSave(key, d, t)} disabled={!gameId} showDC>
                <span className="srd-skill-row__name">{t(labelKey)}</span>
              </Srd5AdvantageOverlay>
              <span className={`srd-skill-row__value ${isProficient ? 'srd-skill-row__value--proficient' : ''}`}>
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
