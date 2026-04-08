import React from 'react';
import { useTranslation } from 'react-i18next';

function Pips({ count, filled, onToggle, type }) {
  return (
    <div className="dnd-death-saves__pips">
      {[0, 1, 2].map(i => (
        <button
          key={i}
          className={`dnd-death-saves__pip ${i < filled ? `dnd-death-saves__pip--${type}` : ''}`}
          onClick={() => onToggle(type, i < filled ? i : i + 1)}
        />
      ))}
    </div>
  );
}

function DeathSavesSection({ deathSaves, onDeathSaveChange }) {
  const { t } = useTranslation();
  const successes = deathSaves?.deathSaveSuccesses ?? 0;
  const failures  = deathSaves?.deathSaveFailures  ?? 0;

  const handleToggle = (type, newCount) => {
    if (type === 'success') onDeathSaveChange('deathSaveSuccesses', newCount);
    else                    onDeathSaveChange('deathSaveFailures',  newCount);
  };

  return (
    <div className="dnd-section dnd-death-saves">
      <h4 className="dnd-section-title">{t('dnd.deathSaves')}</h4>
      <div className="dnd-death-saves__row">
        <span className="dnd-death-saves__label dnd-death-saves__label--success">{t('dnd.deathSaveSuccess')}</span>
        <Pips filled={successes} onToggle={handleToggle} type="success" />
      </div>
      <div className="dnd-death-saves__row">
        <span className="dnd-death-saves__label dnd-death-saves__label--failure">{t('dnd.deathSaveFailure')}</span>
        <Pips filled={failures} onToggle={handleToggle} type="failure" />
      </div>
    </div>
  );
}

export default DeathSavesSection;
