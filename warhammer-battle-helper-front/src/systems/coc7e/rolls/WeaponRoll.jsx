import React from 'react';
import { useTranslation } from 'react-i18next';
import WaxSealToken from '../../../components/log/WaxSealToken';

const OUTCOME_SEAL = {
  critical_success: { seal: '★', color: '#d4af37' },
  extreme_success:  { seal: '◆', color: '#2ecc71' },
  hard_success:     { seal: '▲', color: '#27ae60' },
  regular_success:  { seal: '●', color: '#3498db' },
  failure:          { seal: '✕', color: '#e74c3c' },
  fumble:           { seal: '☠', color: '#8e1010' },
};

function CoCWeaponRoll({ data, timestamp }) {
  const { t } = useTranslation();
  const cfg = OUTCOME_SEAL[data.outcome] || OUTCOME_SEAL.failure;
  const isSuccess = !['failure', 'fumble'].includes(data.outcome);

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
        <div className="roll-skill-name">⚔️ {data.weaponName}</div>

        <div className="roll-dice-line">
          <span className="roll-result">{data.roll}</span>
          <span className="roll-vs"> vs </span>
          <span className="roll-target">{data.target}%</span>
        </div>

        <div className="coc-outcome" style={{ color: cfg.color, fontWeight: 700 }}>
          {t(`coc.${data.outcome}`) || data.outcome}
        </div>

        {isSuccess && data.damageRoll != null && (
          <div className="roll-damage">
            {t('coc.damage')}: <strong>{data.damage}</strong> → <span className="damage-value">{data.damageRoll}</span>
          </div>
        )}
      </div>
    </li>
  );
}

export default CoCWeaponRoll;
