import React from 'react';
import { useTranslation } from 'react-i18next';
import DnD5eAdvantageOverlay from '../DnD5eAdvantageOverlay';
import StarIcon from '@mui/icons-material/Star';
import skillsData from '../skills.json';

function formatMod(mod) {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

// Proficiency levels: 0 = none, 1 = proficient, 2 = expertise
function nextProfLevel(current) {
  return (current + 1) % 3;
}

function profDotClass(level) {
  if (level === 2) return 'dnd-skill-row__prof-dot dnd-skill-row__prof-dot--expert';
  if (level === 1) return 'dnd-skill-row__prof-dot dnd-skill-row__prof-dot--proficient';
  return 'dnd-skill-row__prof-dot';
}

function profTitle(level, t) {
  if (level === 2) return t('dnd.expert');
  if (level === 1) return t('dnd.proficient');
  return '';
}

function SkillsSection({ skillProfs, favoriteSkills, derived, onToggleSkillProf, onToggleFavorite, onRollSkill, gameId }) {
  const { t } = useTranslation();
  const skillTotals = derived?.skills || {};
  const favSet = new Set(favoriteSkills || []);

  const renderSkill = (def) => {
    const prof = skillProfs?.[def.key] ?? 0;
    const total = skillTotals[def.key] ?? 0;
    const isFav = favSet.has(def.key);
    return (
      <div key={def.key} className="dnd-skill-row">
        <button
          className={profDotClass(prof)}
          onClick={() => onToggleSkillProf(def.key, nextProfLevel(prof))}
          title={profTitle(prof, t)}
        />
        <DnD5eAdvantageOverlay onAdvRoll={(d) => onRollSkill && onRollSkill(def.key, d)} disabled={!gameId}>
          <span className="dnd-skill-row__name" title={`${def.label} (${def.ability.toUpperCase()})`}>
            {def.label}
            <span className="dnd-skill-row__ability"> ({def.ability.toUpperCase()})</span>
          </span>
        </DnD5eAdvantageOverlay>
        <span className={`dnd-skill-row__value ${prof > 0 ? 'dnd-skill-row__value--proficient' : ''}`}>
          {formatMod(total)}
        </span>
        <button
          className={`dnd-skill-row__fav ${isFav ? 'dnd-skill-row__fav--active' : ''}`}
          onClick={() => onToggleFavorite && onToggleFavorite(def.key)}
          title={isFav ? t('removeFavorite') : t('addFavorite')}
        >
          <StarIcon style={{ fontSize: 12 }} />
        </button>
      </div>
    );
  };

  return (
    <div className="dnd-section">
      <h4 className="dnd-section-title">{t('dnd.skills')}</h4>
      <div className="dnd-skills-section__grid">
        {skillsData.map(renderSkill)}
      </div>
    </div>
  );
}

export default SkillsSection;
