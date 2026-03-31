import React from 'react';
import { useTranslation } from 'react-i18next';
import CoCDiceModOverlay from '../CoCDiceModOverlay';
import { half, fifth } from '../utils';

const ATTRIBUTES = [
  { key: 'str', labelKey: 'coc.attr_str' },
  { key: 'con', labelKey: 'coc.attr_con' },
  { key: 'siz', labelKey: 'coc.attr_siz' },
  { key: 'dex', labelKey: 'coc.attr_dex' },
  { key: 'app', labelKey: 'coc.attr_app' },
  { key: 'int', labelKey: 'coc.attr_int' },
  { key: 'pow', labelKey: 'coc.attr_pow' },
  { key: 'edu', labelKey: 'coc.attr_edu' },
  { key: 'mov', labelKey: 'coc.attr_mov', simple: true },
];

function AttributesSection({ edited, onFieldChange, onRollAttr, gameId }) {
  const { t } = useTranslation();
  return (
    <div className="coc-section">
      <h4 className="coc-section-title">{t('coc.attrRolls')}</h4>
      <div className="coc-attrs-grid">
        {ATTRIBUTES.map(({ key, labelKey, simple }) => {
          const val = edited[key] || 0;
          return (
            <CoCDiceModOverlay key={key} onDiceModRoll={(d) => onRollAttr(key, d)} disabled={!gameId}>
              <div
                className={`coc-attr-card${simple ? ' coc-attr-card--simple' : ''}${gameId ? ' coc-attr-card--clickable' : ''}`}
                title={gameId ? `Roll ${t(labelKey)}` : undefined}
              >
                <div className="coc-attr-card__name">{t(labelKey)}</div>
                <input
                  type="number"
                  className="coc-attr-card__input"
                  value={val || ''}
                  onChange={e => onFieldChange(key, parseInt(e.target.value) || 0)}
                  onClick={e => e.stopPropagation()}
                  min={0}
                  max={99}
                />
                {!simple && (
                  <div className="coc-attr-card__sub">
                    <div className="coc-attr-card__sub-item">
                      <span className="coc-attr-card__sub-label">½</span>
                      <span className="coc-attr-card__sub-val">{half(val) || '—'}</span>
                    </div>
                    <div className="coc-attr-card__sub-item">
                      <span className="coc-attr-card__sub-label">⅕</span>
                      <span className="coc-attr-card__sub-val">{fifth(val) || '—'}</span>
                    </div>
                  </div>
                )}
              </div>
            </CoCDiceModOverlay>
          );
        })}
      </div>
    </div>
  );
}

export default AttributesSection;
