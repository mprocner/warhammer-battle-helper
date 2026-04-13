import React from 'react';
import { useTranslation } from 'react-i18next';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';

function formatInit(val) {
  const n = val ?? 0;
  return n >= 0 ? `+${n}` : `${n}`;
}

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

function CombatStatsSection({
  resources, derived, armorClass, speed, hitDie, isSpellcaster,
  onResourceChange, onFieldChange,
  deathSaves, onDeathSaveChange,
  level,
}) {
  const { t } = useTranslation();

  const successes = deathSaves?.deathSaveSuccesses ?? 0;
  const failures  = deathSaves?.deathSaveFailures  ?? 0;

  const handleDeathToggle = (type, newCount) => {
    if (type === 'success') onDeathSaveChange('deathSaveSuccesses', newCount);
    else                    onDeathSaveChange('deathSaveFailures',  newCount);
  };

  return (
    <div className="dnd-section dnd-combat-section">

      {/* Row 1: AC | Initiative | Speed */}
      <div className="dnd-combat-top-strip dnd-combat-top-strip--primary">
        <div className="dnd-combat-stat-box">
          <div className="dnd-combat-stat-box__label">{t('dnd.ac')}</div>
          <input
            type="number"
            className="dnd-combat-stat-box__value"
            min={0}
            value={armorClass ?? 10}
            onChange={e => onFieldChange('armorClass', parseInt(e.target.value) || 0)}
          />
        </div>
        <div className="dnd-combat-stat-box">
          <div className="dnd-combat-stat-box__label">{t('dnd.initiative')}</div>
          <div className="dnd-combat-stat-box__value dnd-combat-stat-box__value--readonly">
            {formatInit(derived?.initiative)}
          </div>
        </div>
        <div className="dnd-combat-stat-box">
          <div className="dnd-combat-stat-box__label">{t('dnd.speed')}</div>
          <input
            type="number"
            className="dnd-combat-stat-box__value"
            min={0}
            value={speed ?? 30}
            onChange={e => onFieldChange('speed', parseInt(e.target.value) || 0)}
          />
        </div>
      </div>

      {/* Row 2: HP/Max HP | Temp HP | Hit Die */}
      <div className="dnd-combat-top-strip dnd-combat-top-strip--primary">
        <div className="dnd-combat-stat-box dnd-combat-stat-box--hp">
          <div className="dnd-combat-stat-box__label">{t('dnd.hp')}</div>
          <div className="dnd-hp-inline-row">
            <input
              type="number"
              className="dnd-combat-stat-box__value dnd-hp-inline-row__cur"
              min={0}
              value={resources?.hp ?? 0}
              onChange={e => onResourceChange('hp', parseInt(e.target.value) || 0)}
              title={t('dnd.currentHp')}
            />
            <span className="dnd-hp-inline-row__sep">/</span>
            <input
              type="number"
              className="dnd-combat-stat-box__value dnd-hp-inline-row__max"
              min={0}
              value={resources?.hpMax ?? 0}
              onChange={e => onResourceChange('hpMax', parseInt(e.target.value) || 0)}
              title={t('dnd.maxHp')}
            />
          </div>
        </div>
        <div className="dnd-combat-stat-box">
          <div className="dnd-combat-stat-box__label">{t('dnd.tempHP')}</div>
          <input
            type="number"
            className="dnd-combat-stat-box__value"
            min={0}
            value={resources?.tempHp ?? 0}
            onChange={e => onResourceChange('tempHp', parseInt(e.target.value) || 0)}
          />
        </div>
        <div className="dnd-combat-stat-box dnd-hit-dice-box">
          <div className="dnd-combat-stat-box__label">{t('dnd.hitDie')}</div>
          <input
            className="dnd-hit-dice-box__type"
            value={hitDie ?? 'd8'}
            onChange={e => onFieldChange('hitDie', e.target.value)}
          />
          {(level || 1) <= 12 && (
            <div className="dnd-hit-dice-box__tracker">
              {Array.from({ length: level || 1 }, (_, i) => {
                const remaining = (level || 1) - (resources?.hitDiceUsed ?? 0);
                return (
                  <span
                    key={i}
                    className={`dnd-hit-dice-box__pip${i >= remaining ? ' dnd-hit-dice-box__pip--used' : ''}`}
                  />
                );
              })}
            </div>
          )}
          <div className="dnd-hit-dice-box__controls">
            <button
              className="dnd-hit-dice-box__btn"
              onClick={() => onResourceChange('hitDiceUsed', Math.min(level || 1, (resources?.hitDiceUsed ?? 0) + 1))}
              disabled={(resources?.hitDiceUsed ?? 0) >= (level || 1)}
            >
              <RemoveCircleOutlineIcon style={{ fontSize: 18 }} />
            </button>
            <span className="dnd-hit-dice-box__count">
              {Math.max(0, (level || 1) - (resources?.hitDiceUsed ?? 0))}/{level || 1}
            </span>
            <button
              className="dnd-hit-dice-box__btn"
              onClick={() => onResourceChange('hitDiceUsed', Math.max(0, (resources?.hitDiceUsed ?? 0) - 1))}
              disabled={(resources?.hitDiceUsed ?? 0) <= 0}
            >
              <AddCircleOutlineIcon style={{ fontSize: 18 }} />
            </button>
          </div>
        </div>
      </div>

      {/* Row 3: Spell Save DC | Spell Atk (if spellcaster) | Death Saves */}
      <div className="dnd-combat-top-strip">
        {isSpellcaster && (
          <>
            <div className="dnd-combat-stat-box">
              <div className="dnd-combat-stat-box__label">{t('dnd.spellSaveDC')}</div>
              <div className="dnd-combat-stat-box__value dnd-combat-stat-box__value--readonly">
                {derived?.spellSaveDc ?? 0}
              </div>
            </div>
            <div className="dnd-combat-stat-box">
              <div className="dnd-combat-stat-box__label">{t('dnd.spellAttackBonus')}</div>
              <div className="dnd-combat-stat-box__value dnd-combat-stat-box__value--readonly">
                {formatInit(derived?.spellAttackBonus)}
              </div>
            </div>
          </>
        )}
        <div className="dnd-combat-stat-box dnd-death-saves-box">
          <div className="dnd-combat-stat-box__label">{t('dnd.deathSaves')}</div>
          <div className="dnd-death-saves__row">
            <span className="dnd-death-saves__label dnd-death-saves__label--success">{t('dnd.deathSaveSuccess')}</span>
            <Pips filled={successes} onToggle={handleDeathToggle} type="success" />
          </div>
          <div className="dnd-death-saves__row">
            <span className="dnd-death-saves__label dnd-death-saves__label--failure">{t('dnd.deathSaveFailure')}</span>
            <Pips filled={failures} onToggle={handleDeathToggle} type="failure" />
          </div>
        </div>
      </div>

    </div>
  );
}

export default CombatStatsSection;
