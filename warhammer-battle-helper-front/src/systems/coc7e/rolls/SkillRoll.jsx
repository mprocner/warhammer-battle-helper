import React from 'react';
import { useTranslation } from 'react-i18next';
import WaxSealToken from '../../../components/log/WaxSealToken';

const OUTCOME_CONFIG = {
  critical_success: { label: 'coc.criticalSuccess', color: '#d4af37', seal: '★' },
  extreme_success:  { label: 'coc.extremeSuccess',  color: '#2ecc71', seal: '◆' },
  hard_success:     { label: 'coc.hardSuccess',      color: '#27ae60', seal: '▲' },
  regular_success:  { label: 'coc.regularSuccess',   color: '#3498db', seal: '●' },
  failure:          { label: 'coc.failure',           color: '#e74c3c', seal: '✕' },
  fumble:           { label: 'coc.fumble',            color: '#8e1010', seal: '☠' },
};

function CoCSkillRoll({ data, timestamp }) {
  const { t } = useTranslation();
  const cfg = OUTCOME_CONFIG[data.outcome] || OUTCOME_CONFIG.failure;

  return (
    <li className="log-entry log-entry--roll">
      <div className="roll-header">
        <WaxSealToken symbol={cfg.seal} color={cfg.color} />
        <div className="roll-info">
          <span className="roll-character">{data.characterName}</span>
          {data.username && <span className="roll-user"> ({data.username})</span>}
        </div>
        {timestamp && <span className="roll-timestamp">{timestamp}</span>}
      </div>

      <div className="roll-body">
        <div className="roll-skill-name">{data.skillName || data.skillKey}</div>
        {data.modifier !== 0 && (
          <span className="roll-modifier">
            ({data.modifier > 0 ? '+' : ''}{data.modifier})
          </span>
        )}

        <div className="roll-dice-line">
          <span className="roll-result">{data.roll}</span>
          <span className="roll-vs"> vs </span>
          <span className="roll-target">{data.target}%</span>
        </div>

        <div className="coc-outcome" style={{ color: cfg.color, fontWeight: 700 }}>
          {t(cfg.label)}
        </div>

        {/* Hard / Extreme thresholds hint */}
        <div className="coc-thresholds">
          <span>{t('coc.hard')}: {Math.floor(data.target / 2)}%</span>
          <span> · </span>
          <span>{t('coc.extreme')}: {Math.floor(data.target / 5)}%</span>
        </div>
      </div>
    </li>
  );
}

export default CoCSkillRoll;
