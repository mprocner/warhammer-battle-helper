import React from 'react';
import { useTranslation } from 'react-i18next';
import WaxSealToken from '../../../components/log/WaxSealToken';
import { getResultColor } from '../../../components/log/rollUtils';
import skillsData from '../skills.json';
import '../../../components/LogWindow.css';

// Maps CoC outcome keys to WaxSealToken props + translation key
const OUTCOME_MAP = {
  critical_success: { isCritSuccess: true,  isCritFailure: false, isSuccess: true,  symbol: '★', label: 'coc.criticalSuccess' },
  extreme_success:  { isCritSuccess: true,  isCritFailure: false, isSuccess: true,  symbol: '◆', label: 'coc.extremeSuccess'  },
  hard_success:     { isCritSuccess: false, isCritFailure: false, isSuccess: true,  symbol: '▲', label: 'coc.hardSuccess'      },
  regular_success:  { isCritSuccess: false, isCritFailure: false, isSuccess: true,  symbol: '●', label: 'coc.regularSuccess'   },
  failure:          { isCritSuccess: false, isCritFailure: false, isSuccess: false, symbol: '✕', label: 'coc.failure'          },
  fumble:           { isCritSuccess: false, isCritFailure: true,  isSuccess: false, symbol: '☠', label: 'coc.fumble'           },
};

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

function getSkillDisplayName(t, skillKey, skillName) {
  if (skillKey?.startsWith('attr_')) {
    const attrKey = skillKey.slice(5);
    const i18nKey = ATTR_I18N[attrKey];
    return i18nKey ? t(i18nKey) : (skillName || skillKey);
  }
  const found = skillsData.find(s => s.key === skillKey);
  if (found) return t(found.labelKey, { defaultValue: found.label });
  // Fallback: format key like fighting_brawl → Fighting Brawl
  return (skillName || skillKey || '')
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function CoCSkillRoll({ data, timestamp }) {
  const { t } = useTranslation();
  const cfg = OUTCOME_MAP[data.outcome] || OUTCOME_MAP.failure;
  const { isCritSuccess, isCritFailure, isSuccess, label } = cfg;
  const resultColor = data.outcome === 'hard_success'
    ? '#4a7fa5'
    : getResultColor(isCritSuccess, isCritFailure, isSuccess);
  const displayName = getSkillDisplayName(t, data.skillKey, data.skillName);

  return (
    <li className="log-list-item">
      <WaxSealToken
        symbol={data.roll}
        isCritSuccess={isCritSuccess}
        isCritFailure={isCritFailure}
        isSuccess={isSuccess}
        successLevel={0}
        overrideColor={data.outcome === 'hard_success' ? '#4a7fa5' : undefined}
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
          {data.modifier !== 0 && (
            <span className="log-modifier">
              {' '}({t('log.modifier')}: {data.modifier >= 0 ? '+' : ''}{data.modifier})
            </span>
          )}
        </div>

        <div className="log-list-item__result" style={{ color: resultColor }}>
          {t(label)}
        </div>

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

export default CoCSkillRoll;
