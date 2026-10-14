import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import StarIcon from '@mui/icons-material/Star';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';
import CasinoIcon from '@mui/icons-material/Casino';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import Srd5AdvantageOverlay from '../Srd5AdvantageOverlay';

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

function SpellsSection({ spells, onSpellChange, onAddSpell, onRemoveSpell, onToggleFavourite, onSaveSpell, onRollSpell, gameId }) {
  const { t } = useTranslation();
  const [expandedIdx, setExpandedIdx] = useState(null);

  const sorted = [...(spells || [])].map((s, i) => ({ ...s, _idx: i }))
    .sort((a, b) => (a.level ?? 0) - (b.level ?? 0));

  return (
    <div className="srd-section">
      <h4 className="srd-section-title">{t('srd.spells')}</h4>

      <div className="srd-spells-header">
        <span className="srd-spells-header__expand" />
        <span className="srd-spells-header__lvl">LVL</span>
        <span className="srd-spells-header__name">{t('srd.spellName')}</span>
        <span className="srd-spells-header__flag" title={t('srd.prepared')}>P</span>
        <span className="srd-spells-header__flag" title={t('srd.concentration')}>C</span>
        <span className="srd-spells-header__flag" title={t('srd.ritual')}>R</span>
        <span className="srd-spells-header__actions" />
      </div>

      {sorted.map(spell => {
        const idx = spell._idx;
        const isExpanded = expandedIdx === idx;
        return (
          <div key={idx} className="srd-spell-row">
            <div className="srd-spell-row__main">
              <button
                className="srd-spell-row__expand"
                onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                title={t('srd.spellDescription')}
              >
                {isExpanded
                  ? <ExpandLessIcon style={{ fontSize: 18 }} />
                  : <ExpandMoreIcon style={{ fontSize: 18 }} />}
              </button>

              <select
                className="srd-spell-row__level"
                value={spell.level ?? 0}
                onChange={e => onSpellChange(idx, 'level', parseInt(e.target.value))}
                style={{ color: LEVEL_COLORS[spell.level ?? 0] }}
              >
                {LEVEL_LABELS.map((lbl, i) => (
                  <option key={i} value={i}>{lbl}</option>
                ))}
              </select>

              <input
                className="srd-spell-row__name"
                value={spell.name || ''}
                placeholder={t('srd.spellName')}
                onChange={e => onSpellChange(idx, 'name', e.target.value)}
              />

              <button
                className={`srd-spell-row__flag-btn ${spell.prepared ? 'srd-spell-row__flag-btn--on' : ''}`}
                onClick={() => onSpellChange(idx, 'prepared', !spell.prepared)}
                title={t('srd.prepared')}
              >P</button>

              <button
                className={`srd-spell-row__flag-btn ${spell.concentration ? 'srd-spell-row__flag-btn--on' : ''}`}
                onClick={() => onSpellChange(idx, 'concentration', !spell.concentration)}
                title={t('srd.concentration')}
              >C</button>

              <button
                className={`srd-spell-row__flag-btn ${spell.ritual ? 'srd-spell-row__flag-btn--on' : ''}`}
                onClick={() => onSpellChange(idx, 'ritual', !spell.ritual)}
                title={t('srd.ritual')}
              >R</button>

              <div className="srd-spell-row__actions">
                {gameId && (
                  <Srd5AdvantageOverlay onAdvRoll={(d) => onRollSpell && onRollSpell(spell, d)} disabled={!spell.name}>
                    <button className="srd-spell-row__roll" title={t('srd.rollSpell')}>
                      <CasinoIcon style={{ fontSize: 16 }} />
                    </button>
                  </Srd5AdvantageOverlay>
                )}

                <button
                  className="srd-spell-row__save"
                  onClick={() => onSaveSpell && onSaveSpell(idx)}
                  title={t('save')}
                >
                  <SaveIcon style={{ fontSize: 16 }} />
                </button>

                <button
                  className={`srd-spell-row__fav ${spell.isFavourite ? 'srd-spell-row__fav--active' : ''}`}
                  onClick={() => onToggleFavourite(idx)}
                  title={spell.isFavourite ? t('removeFavorite') : t('addFavorite')}
                >
                  <StarIcon style={{ fontSize: 16 }} />
                </button>

                <button
                  className="srd-spell-row__delete"
                  onClick={() => onRemoveSpell(idx)}
                  title={t('delete')}
                >
                  <DeleteIcon style={{ fontSize: 16 }} />
                </button>
              </div>
            </div>

            {isExpanded && (
              <textarea
                className="srd-spell-row__desc"
                rows={2}
                value={spell.description || ''}
                placeholder={t('srd.spellDescription')}
                onChange={e => onSpellChange(idx, 'description', e.target.value)}
              />
            )}
          </div>
        );
      })}

      <button className="srd-add-btn" onClick={onAddSpell}>
        <AddIcon style={{ fontSize: 18 }} /> {t('srd.addSpell')}
      </button>
    </div>
  );
}

export default SpellsSection;
