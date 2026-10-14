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
    <div className="srd-death-saves__pips">
      {[0, 1, 2].map(i => (
        <button
          key={i}
          className={`srd-death-saves__pip ${i < filled ? `srd-death-saves__pip--${type}` : ''}`}
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
    <div className="srd-section srd-combat-section">

      {/* Row 1: AC | Initiative | Speed */}
      <div className="srd-combat-top-strip srd-combat-top-strip--primary">
        <div className="srd-combat-stat-box">
          <div className="srd-combat-stat-box__label">{t('srd.ac')}</div>
          <input
            type="number"
            className="srd-combat-stat-box__value"
            min={0}
            value={armorClass ?? 10}
            onChange={e => onFieldChange('armorClass', parseInt(e.target.value) || 0)}
          />
        </div>
        <div className="srd-combat-stat-box">
          <div className="srd-combat-stat-box__label">{t('srd.initiative')}</div>
          <div className="srd-combat-stat-box__value srd-combat-stat-box__value--readonly">
            {formatInit(derived?.initiative)}
          </div>
        </div>
        <div className="srd-combat-stat-box">
          <div className="srd-combat-stat-box__label">{t('srd.speed')}</div>
          <input
            type="number"
            className="srd-combat-stat-box__value"
            min={0}
            value={speed ?? 30}
            onChange={e => onFieldChange('speed', parseInt(e.target.value) || 0)}
          />
        </div>
      </div>

      {/* Row 2: HP/Max HP | Temp HP | Hit Die */}
      <div className="srd-combat-top-strip srd-combat-top-strip--primary">
        <div className="srd-combat-stat-box srd-combat-stat-box--hp">
          <div className="srd-combat-stat-box__label">{t('srd.hp')}</div>
          <div className="srd-hp-inline-row">
            <input
              type="number"
              className="srd-combat-stat-box__value srd-hp-inline-row__cur"
              min={0}
              value={resources?.hp ?? 0}
              onChange={e => onResourceChange('hp', parseInt(e.target.value) || 0)}
              title={t('srd.currentHp')}
            />
            <span className="srd-hp-inline-row__sep">/</span>
            <input
              type="number"
              className="srd-combat-stat-box__value srd-hp-inline-row__max"
              min={0}
              value={resources?.hpMax ?? 0}
              onChange={e => onResourceChange('hpMax', parseInt(e.target.value) || 0)}
              title={t('srd.maxHp')}
            />
          </div>
        </div>
        <div className="srd-combat-stat-box">
          <div className="srd-combat-stat-box__label">{t('srd.tempHP')}</div>
          <input
            type="number"
            className="srd-combat-stat-box__value"
            min={0}
            value={resources?.tempHp ?? 0}
            onChange={e => onResourceChange('tempHp', parseInt(e.target.value) || 0)}
          />
        </div>
        <div className="srd-combat-stat-box srd-hit-dice-box">
          <div className="srd-combat-stat-box__label">{t('srd.hitDie')}</div>
          <input
            className="srd-hit-dice-box__type"
            value={hitDie ?? 'd8'}
            onChange={e => onFieldChange('hitDie', e.target.value)}
          />
          {(level || 1) <= 12 && (
            <div className="srd-hit-dice-box__tracker">
              {Array.from({ length: level || 1 }, (_, i) => {
                const remaining = (level || 1) - (resources?.hitDiceUsed ?? 0);
                return (
                  <span
                    key={i}
                    className={`srd-hit-dice-box__pip${i >= remaining ? ' srd-hit-dice-box__pip--used' : ''}`}
                  />
                );
              })}
            </div>
          )}
          <div className="srd-hit-dice-box__controls">
            <button
              className="srd-hit-dice-box__btn"
              onClick={() => onResourceChange('hitDiceUsed', Math.min(level || 1, (resources?.hitDiceUsed ?? 0) + 1))}
              disabled={(resources?.hitDiceUsed ?? 0) >= (level || 1)}
            >
              <RemoveCircleOutlineIcon style={{ fontSize: 18 }} />
            </button>
            <span className="srd-hit-dice-box__count">
              {Math.max(0, (level || 1) - (resources?.hitDiceUsed ?? 0))}/{level || 1}
            </span>
            <button
              className="srd-hit-dice-box__btn"
              onClick={() => onResourceChange('hitDiceUsed', Math.max(0, (resources?.hitDiceUsed ?? 0) - 1))}
              disabled={(resources?.hitDiceUsed ?? 0) <= 0}
            >
              <AddCircleOutlineIcon style={{ fontSize: 18 }} />
            </button>
          </div>
        </div>
      </div>

      {/* Row 3: Spell Save DC | Spell Atk (if spellcaster) | Death Saves */}
      <div className="srd-combat-top-strip">
        {isSpellcaster && (
          <>
            <div className="srd-combat-stat-box">
              <div className="srd-combat-stat-box__label">{t('srd.spellSaveDC')}</div>
              <div className="srd-combat-stat-box__value srd-combat-stat-box__value--readonly">
                {derived?.spellSaveDc ?? 0}
              </div>
            </div>
            <div className="srd-combat-stat-box">
              <div className="srd-combat-stat-box__label">{t('srd.spellAttackBonus')}</div>
              <div className="srd-combat-stat-box__value srd-combat-stat-box__value--readonly">
                {formatInit(derived?.spellAttackBonus)}
              </div>
            </div>
          </>
        )}
        <div className="srd-combat-stat-box srd-death-saves-box">
          <div className="srd-combat-stat-box__label">{t('srd.deathSaves')}</div>
          <div className="srd-death-saves__row">
            <span className="srd-death-saves__label srd-death-saves__label--success">{t('srd.deathSaveSuccess')}</span>
            <Pips filled={successes} onToggle={handleDeathToggle} type="success" />
          </div>
          <div className="srd-death-saves__row">
            <span className="srd-death-saves__label srd-death-saves__label--failure">{t('srd.deathSaveFailure')}</span>
            <Pips filled={failures} onToggle={handleDeathToggle} type="failure" />
          </div>
        </div>
      </div>

    </div>
  );
}

export default CombatStatsSection;
