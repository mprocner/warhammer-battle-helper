import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import StarIcon from '@mui/icons-material/Star';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';

const LEVEL_LABELS = ['C', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const LEVEL_COLORS = [
  '#7a5c42', // cantrip
  '#5a7a9e', // 1
  '#6b8e5a', // 2
  '#8e7a5a', // 3
  '#7a5a8e', // 4
  '#8e5a5a', // 5
  '#5a8e8e', // 6
  '#8e6b3a', // 7
  '#6b3a8e', // 8
  '#3a6b8e', // 9
];

function SpellsSection({ spells, onSpellChange, onAddSpell, onRemoveSpell, onToggleFavourite, onSaveSpell }) {
  const { t } = useTranslation();
  const [expandedIdx, setExpandedIdx] = useState(null);

  const sorted = [...(spells || [])].map((s, i) => ({ ...s, _idx: i }))
    .sort((a, b) => (a.level ?? 0) - (b.level ?? 0));

  return (
    <div className="dnd-section">
      <h4 className="dnd-section-title">{t('dnd.spells')}</h4>

      <div className="dnd-spells-header">
        <span className="dnd-spells-header__lvl">LVL</span>
        <span className="dnd-spells-header__name">{t('dnd.spellName')}</span>
        <span className="dnd-spells-header__flag" title={t('dnd.prepared')}>P</span>
        <span className="dnd-spells-header__flag" title={t('dnd.concentration')}>C</span>
        <span className="dnd-spells-header__flag" title={t('dnd.ritual')}>R</span>
        <span className="dnd-spells-header__actions" />
      </div>

      {sorted.map(spell => {
        const idx = spell._idx;
        const isExpanded = expandedIdx === idx;
        return (
          <div key={idx} className="dnd-spell-row">
            <div className="dnd-spell-row__main">
              <select
                className="dnd-spell-row__level"
                value={spell.level ?? 0}
                onChange={e => onSpellChange(idx, 'level', parseInt(e.target.value))}
                style={{ color: LEVEL_COLORS[spell.level ?? 0] }}
              >
                {LEVEL_LABELS.map((lbl, i) => (
                  <option key={i} value={i}>{lbl}</option>
                ))}
              </select>

              <input
                className="dnd-spell-row__name"
                value={spell.name || ''}
                placeholder={t('dnd.spellName')}
                onChange={e => onSpellChange(idx, 'name', e.target.value)}
                onClick={() => setExpandedIdx(isExpanded ? null : idx)}
              />

              <button
                className={`dnd-spell-row__flag-btn ${spell.prepared ? 'dnd-spell-row__flag-btn--on' : ''}`}
                onClick={() => onSpellChange(idx, 'prepared', !spell.prepared)}
                title={t('dnd.prepared')}
              >P</button>

              <button
                className={`dnd-spell-row__flag-btn ${spell.concentration ? 'dnd-spell-row__flag-btn--on' : ''}`}
                onClick={() => onSpellChange(idx, 'concentration', !spell.concentration)}
                title={t('dnd.concentration')}
              >C</button>

              <button
                className={`dnd-spell-row__flag-btn ${spell.ritual ? 'dnd-spell-row__flag-btn--on' : ''}`}
                onClick={() => onSpellChange(idx, 'ritual', !spell.ritual)}
                title={t('dnd.ritual')}
              >R</button>

              <button
                className="dnd-spell-row__save"
                onClick={() => onSaveSpell && onSaveSpell(idx)}
                title={t('save')}
              >
                <SaveIcon style={{ fontSize: 12 }} />
              </button>

              <button
                className={`dnd-spell-row__fav ${spell.isFavourite ? 'dnd-spell-row__fav--active' : ''}`}
                onClick={() => onToggleFavourite(idx)}
                title={spell.isFavourite ? t('removeFavorite') : t('addFavorite')}
              >
                <StarIcon style={{ fontSize: 12 }} />
              </button>

              <button
                className="dnd-spell-row__delete"
                onClick={() => onRemoveSpell(idx)}
                title={t('delete')}
              >
                <DeleteIcon style={{ fontSize: 12 }} />
              </button>
            </div>

            {isExpanded && (
              <textarea
                className="dnd-spell-row__desc"
                rows={2}
                value={spell.description || ''}
                placeholder={t('dnd.spellDescription')}
                onChange={e => onSpellChange(idx, 'description', e.target.value)}
              />
            )}
          </div>
        );
      })}

      <button className="dnd-add-btn" onClick={onAddSpell}>
        <AddIcon style={{ fontSize: 14 }} /> {t('dnd.addSpell')}
      </button>
    </div>
  );
}

export default SpellsSection;
