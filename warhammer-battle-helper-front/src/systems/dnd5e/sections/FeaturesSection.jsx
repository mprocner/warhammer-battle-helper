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
    <div className="dnd-section">
      <h4 className="dnd-section-title">{t('dnd.features')}</h4>
      {features.length === 0 && (
        <div className="dnd-empty-hint">{t('dnd.noFeatures')}</div>
      )}
      {features.map((f, i) => (
        <div key={i} className="dnd-feature">
          <div className="dnd-feature__header">
            <input
              className="dnd-feature__name"
              value={f.name || ''}
              onChange={e => onFeatureChange(i, 'name', e.target.value)}
              placeholder={t('dnd.featureName')}
            />
            <select
              className="dnd-feature__source"
              value={f.source || 'Class'}
              onChange={e => onFeatureChange(i, 'source', e.target.value)}
            >
              {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button className="dnd-feature__toggle" onClick={() => toggle(i)}>
              {expanded.has(i) ? <ExpandLessIcon style={{ fontSize: 14 }} /> : <ExpandMoreIcon style={{ fontSize: 14 }} />}
            </button>
            <button className="dnd-feature__del" onClick={() => onRemoveFeature(i)} title={t('common.delete')}>
              <DeleteIcon style={{ fontSize: 14 }} />
            </button>
          </div>
          {expanded.has(i) && (
            <textarea
              className="dnd-feature__desc"
              value={f.description || ''}
              onChange={e => onFeatureChange(i, 'description', e.target.value)}
              rows={3}
              placeholder={t('dnd.featureDescription')}
            />
          )}
        </div>
      ))}
      <button className="dnd-add-btn" onClick={onAddFeature}>
        <AddCircleOutlineIcon style={{ fontSize: 14, marginRight: 4 }} />
        {t('dnd.addFeature')}
      </button>
    </div>
  );
}

export default FeaturesSection;
