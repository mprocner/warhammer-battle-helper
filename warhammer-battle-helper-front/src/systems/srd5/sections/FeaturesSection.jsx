import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import DeleteIcon from '@mui/icons-material/Delete';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

const SOURCES = ['Class', 'Species', 'Background', 'Feat', 'Other'];

function FeaturesSection({ features, onFeatureChange, onAddFeature, onRemoveFeature }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(new Set());

  const toggle = (i) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(i) ? next.delete(i) : next.add(i);
    return next;
  });

  return (
    <div className="srd-section">
      <h4 className="srd-section-title">{t('srd.features')}</h4>
      {features.length === 0 && (
        <div className="srd-empty-hint">{t('srd.noFeatures')}</div>
      )}
      {features.map((f, i) => (
        <div key={i} className="srd-feature">
          <div className="srd-feature__header">
            <input
              className="srd-feature__name"
              value={f.name || ''}
              onChange={e => onFeatureChange(i, 'name', e.target.value)}
              placeholder={t('srd.featureName')}
            />
            <select
              className="srd-feature__source"
              value={f.source || 'Class'}
              onChange={e => onFeatureChange(i, 'source', e.target.value)}
            >
              {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button className="srd-feature__toggle" onClick={() => toggle(i)}>
              {expanded.has(i) ? <ExpandLessIcon style={{ fontSize: 14 }} /> : <ExpandMoreIcon style={{ fontSize: 14 }} />}
            </button>
            <button className="srd-feature__del" onClick={() => onRemoveFeature(i)} title={t('common.delete')}>
              <DeleteIcon style={{ fontSize: 14 }} />
            </button>
          </div>
          {expanded.has(i) && (
            <textarea
              className="srd-feature__desc"
              value={f.description || ''}
              onChange={e => onFeatureChange(i, 'description', e.target.value)}
              rows={3}
              placeholder={t('srd.featureDescription')}
            />
          )}
        </div>
      ))}
      <button className="srd-add-btn" onClick={onAddFeature}>
        <AddCircleOutlineIcon style={{ fontSize: 14, marginRight: 4 }} />
        {t('srd.addFeature')}
      </button>
    </div>
  );
}

export default FeaturesSection;
