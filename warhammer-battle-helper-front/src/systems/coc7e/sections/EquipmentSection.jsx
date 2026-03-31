import React from 'react';
import { useTranslation } from 'react-i18next';

function EquipmentSection({ edited, onFieldChange }) {
  const { t } = useTranslation();
  return (
    <div className="coc-section">
      <div className="coc-equip-row">
        <div className="coc-equip-panel">
          <h4 className="coc-section-title">{t('coc.equipmentSection')}</h4>
          <textarea
            className="coc-equip-textarea"
            value={edited.equipment || ''}
            onChange={e => onFieldChange('equipment', e.target.value)}
          />
        </div>
        <div className="coc-equip-panel">
          <h4 className="coc-section-title">{t('coc.cashAndPossessions')}</h4>
          <div className="coc-equip-inputs">
            <div className="coc-equip-input-row">
              <label>{t('coc.spendingLevel')}</label>
              <input value={edited.spendingLevel || ''} onChange={e => onFieldChange('spendingLevel', e.target.value)} />
            </div>
            <div className="coc-equip-input-row">
              <label>{t('coc.cash')}</label>
              <input value={edited.cash || ''} onChange={e => onFieldChange('cash', e.target.value)} />
            </div>
          </div>
          <label className="coc-bg-label">{t('coc.assets')}</label>
          <textarea
            className="coc-equip-textarea"
            value={edited.assets || ''}
            onChange={e => onFieldChange('assets', e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

export default EquipmentSection;
