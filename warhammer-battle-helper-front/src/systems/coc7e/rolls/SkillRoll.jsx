import React from 'react';
import { useTranslation } from 'react-i18next';
import WaxSealToken from '../../../components/log/WaxSealToken';
import { getOutcomeConfig } from '../utils';
import defaultSkillsData from '../skills.json';
import '../../../components/LogWindow.css';

// Maps attr_ skillKey suffixes to coc translation keys
const ATTR_I18N = {
  str: 'coc.strength',
  con: 'coc.constitution',
  int: 'coc.intelligence',
  pow: 'coc.power',
  dex: 'coc.dexterity',
  app: 'coc.appearance',
  siz: 'coc.size',
  edu: 'coc.education',
  sanity: 'coc.sanity',
  luck: 'coc.luck',
};

function makeGetSkillDisplayName(skillsData) {
  return function getSkillDisplayName(t, skillKey, skillName) {
    if (skillKey?.startsWith('attr_')) {
      const attrKey = skillKey.slice(5);
      const i18nKey = ATTR_I18N[attrKey];
      return i18nKey ? t(i18nKey) : (skillName || skillKey);
    }
    const found = skillsData.find(s => s.key === skillKey);
    if (found) {
      return found.labelKey ? t(found.labelKey, { defaultValue: found.label }) : found.label;
    }
    // Fallback: format key like fighting_brawl → Fighting Brawl
    return (skillName || skillKey || '')
      .split('_')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  };
}

export function createSkillRoll(skillsData) {
  const getSkillDisplayName = makeGetSkillDisplayName(skillsData);

  function CoCSkillRoll({ data, timestamp }) {
  const { t } = useTranslation();
  const { isCritSuccess, isCritFailure, isSuccess, label, color: resultColor, sealColor } = getOutcomeConfig(data.outcome);
  const displayName = getSkillDisplayName(t, data.skillKey, data.skillName);

  return (
    <li className="log-list-item">
      <WaxSealToken
        symbol={data.roll}
        isCritSuccess={isCritSuccess}
        isCritFailure={isCritFailure}
        isSuccess={isSuccess}
        successLevel={0}
        overrideColor={sealColor}
      />
      <div className="log-list-item__content">
        <div className="log-list-item__header">
          <span className="log-list-item__character-name">
            {data.characterName || t('log.character')}
            {data.username && (
              <span style={{ fontWeight: 400 }}> ({data.username})</span>
            )}
          </span>
          {timestamp && (
            <span className="log-list-item__timestamp">{timestamp}</span>
          )}
        </div>

        <div className="log-list-item__description">
          <strong className="log-list-item__character-name">{displayName}</strong>
          {': '}
          <strong className="log-roll-value" style={{ color: resultColor }}>
            {data.roll}
          </strong>
          {' '}{t('log.vs')}{' '}
          <strong className="log-roll-value" style={{ color: resultColor }}>
            {data.target}
          </strong>
        </div>

        <div className="log-list-item__result" style={{ color: resultColor }}>
          {t(label)}
        </div>

        {/* Bonus / Penalty dice summary */}
        {data.allRolls?.length > 1 && (
          <div style={{ fontSize: 13, color: 'var(--log-brown-dark, #5a4a3a)', marginTop: 2 }}>
            {data.diceMod > 0
              ? t('coc.bonusDice', { count: data.diceMod })
              : t('coc.penaltyDice', { count: Math.abs(data.diceMod) })}
            {' · '}
            {t('coc.allRolls')}{': '}
            {data.allRolls.map((r, i) => (
              <span key={i} style={{ fontSize: 15, fontWeight: r === data.roll ? 700 : 400, textDecoration: r === data.roll ? 'underline' : 'none', marginRight: 4 }}>
                {r}
              </span>
            ))}
          </div>
        )}

        {/* Hard / Extreme thresholds hint */}
        <div style={{ fontSize: 12, color: 'var(--log-brown-dark, #5a4a3a)', marginTop: 2 }}>
          {t('coc.hard')}: {Math.floor(data.target / 2)}
          {' · '}
          {t('coc.extreme')}: {Math.floor(data.target / 5)}
        </div>
      </div>
    </li>
  );
}

  return CoCSkillRoll;
}

export default createSkillRoll(defaultSkillsData);
