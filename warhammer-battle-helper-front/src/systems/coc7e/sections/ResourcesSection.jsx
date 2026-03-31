import React from 'react';
import { useTranslation } from 'react-i18next';
import CoCDiceModOverlay from '../CoCDiceModOverlay';
import CasinoIcon from '@mui/icons-material/Casino';

function ResourcesSection({ edited, onFieldChange, onRollAttr, gameId }) {
  const { t } = useTranslation();
  return (
    <div className="coc-section">
      <div className="coc-resources-grid">
        <div className="coc-resource-pair coc-resource-pair--featured">
          <label>{t('coc.hp')}</label>
          <div className="coc-resource-pair__inputs">
            <input type="number" value={edited.hp ?? ''} onChange={e => onFieldChange('hp', parseInt(e.target.value) || 0)} />
            <span>/</span>
            <span className="coc-resource-pair__derived">{edited.hpMax ?? 0}</span>
          </div>
        </div>
        <div className="coc-resource-pair coc-resource-pair--featured">
          <label>{t('coc.mp')}</label>
          <div className="coc-resource-pair__inputs">
            <input type="number" value={edited.mp ?? ''} onChange={e => onFieldChange('mp', parseInt(e.target.value) || 0)} />
            <span>/</span>
            <span className="coc-resource-pair__derived">{edited.mpMax ?? 0}</span>
          </div>
        </div>
        <div className="coc-resource-pair coc-resource-pair--featured coc-resource-pair--rollable">
          <div className="coc-resource-pair__body">
            <label>{t('coc.sanity')}</label>
            <div className="coc-resource-pair__inputs">
              <input type="number" value={edited.sanity ?? ''} onChange={e => onFieldChange('sanity', parseInt(e.target.value) || 0)} />
              <span>/</span>
              <span className="coc-resource-pair__derived">{edited.sanityMax ?? 99}</span>
            </div>
          </div>
          {gameId && (
            <CoCDiceModOverlay onDiceModRoll={(d) => onRollAttr('sanity', d)} disabled={!gameId}>
              <button className="coc-roll-btn coc-roll-btn--lg" title="Roll Sanity"><CasinoIcon fontSize="large" /></button>
            </CoCDiceModOverlay>
          )}
        </div>
        <div className="coc-resource-pair coc-resource-pair--featured coc-resource-pair--rollable">
          <div className="coc-resource-pair__body">
            <label>{t('coc.luck')}</label>
            <div className="coc-resource-pair__inputs">
              <input type="number" value={edited.luck ?? ''} onChange={e => onFieldChange('luck', parseInt(e.target.value) || 0)} />
            </div>
          </div>
          {gameId && (
            <CoCDiceModOverlay onDiceModRoll={(d) => onRollAttr('luck', d)} disabled={!gameId}>
              <button className="coc-roll-btn coc-roll-btn--lg" title="Roll Luck"><CasinoIcon fontSize="large" /></button>
            </CoCDiceModOverlay>
          )}
        </div>
        <div className="coc-resource-pair">
          <label>{t('coc.damageBonus')}</label>
          <span className="coc-resource-pair__derived">{edited.damageBonus || '0'}</span>
        </div>
        <div className="coc-resource-pair">
          <label>{t('coc.build')}</label>
          <span className="coc-resource-pair__derived">{edited.build ?? 0}</span>
        </div>
      </div>
    </div>
  );
}

export default ResourcesSection;
