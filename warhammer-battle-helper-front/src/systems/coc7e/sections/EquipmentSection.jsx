import React from 'react';
import { useTranslation } from 'react-i18next';

function EquipmentSection({ equipment, finances, onEquipmentChange, onFinancesChange }) {
  const { t } = useTranslation();
  return (
    <div className="coc-section">
      <div className="coc-equip-row">
        <div className="coc-equip-panel">
          <h4 className="coc-section-title">{t('coc.equipmentSection')}</h4>
          <textarea
            className="coc-equip-textarea"
            value={equipment || ''}
            onChange={e => onEquipmentChange(e.target.value)}
          />
        </div>
        <div className="coc-equip-panel">
          <h4 className="coc-section-title">{t('coc.cashAndPossessions')}</h4>
          <div className="coc-equip-inputs">
            <div className="coc-equip-input-row">
              <label>{t('coc.spendingLevel')}</label>
              <input value={finances.spendingLevel || ''} onChange={e => onFinancesChange('spendingLevel', e.target.value)} />
            </div>
            <div className="coc-equip-input-row">
              <label>{t('coc.cash')}</label>
              <input value={finances.cash || ''} onChange={e => onFinancesChange('cash', e.target.value)} />
            </div>
          </div>
          <label className="coc-bg-label">{t('coc.assets')}</label>
          <textarea
            className="coc-equip-textarea"
            value={finances.assets || ''}
            onChange={e => onFinancesChange('assets', e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

export default EquipmentSection;
