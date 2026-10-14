import React from 'react';
import { useTranslation } from 'react-i18next';
import Srd5AdvantageOverlay from '../Srd5AdvantageOverlay';
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
  if (level === 2) return 'srd-skill-row__prof-dot srd-skill-row__prof-dot--expert';
  if (level === 1) return 'srd-skill-row__prof-dot srd-skill-row__prof-dot--proficient';
  return 'srd-skill-row__prof-dot';
}

function profTitle(level, t) {
  if (level === 2) return t('srd.expert');
  if (level === 1) return t('srd.proficient');
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
      <div key={def.key} className="srd-skill-row">
        <button
          className={profDotClass(prof)}
          onClick={() => onToggleSkillProf(def.key, nextProfLevel(prof))}
          title={profTitle(prof, t)}
        />
        <Srd5AdvantageOverlay onAdvRoll={(d, t) => onRollSkill && onRollSkill(def.key, d, t)} disabled={!gameId} showDC>
          <span className="srd-skill-row__name" title={`${t('srd.skill_' + def.key)} (${t('srd.' + def.ability).toUpperCase()})`}>
            {t('srd.skill_' + def.key)}
            <span className="srd-skill-row__ability"> ({t('srd.' + def.ability).toUpperCase()})</span>
          </span>
        </Srd5AdvantageOverlay>
        <span className={`srd-skill-row__value ${prof > 0 ? 'srd-skill-row__value--proficient' : ''}`}>
          {formatMod(total)}
        </span>
        <button
          className={`srd-skill-row__fav ${isFav ? 'srd-skill-row__fav--active' : ''}`}
          onClick={() => onToggleFavorite && onToggleFavorite(def.key)}
          title={isFav ? t('removeFavorite') : t('addFavorite')}
        >
          <StarIcon style={{ fontSize: 12 }} />
        </button>
      </div>
    );
  };

  return (
    <div className="srd-section">
      <h4 className="srd-section-title">{t('srd.skills')}</h4>
      <div className="srd-skills-section__grid">
        {skillsData.map(renderSkill)}
      </div>
    </div>
  );
}

export default SkillsSection;
