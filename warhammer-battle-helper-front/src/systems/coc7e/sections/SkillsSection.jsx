import React, { useState, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import CoCDiceModOverlay from '../CoCDiceModOverlay';
import StarIcon from '@mui/icons-material/Star';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckIcon from '@mui/icons-material/Check';
import EditIcon from '@mui/icons-material/Edit';
import skillsData from '../skills.json';
import { half, fifth, skillVal } from '../utils';

function SkillsSection({
  edited,
  onSetSkill,
  onToggleSkillFlag,
  onAddCustomSkill,
  onRemoveCustomSkill,
  onUpdateCustomSkillName,
  onUpdateCustomSkillBase,
  onRollSkill,
  gameId,
}) {
  const { t } = useTranslation();

  const [editingCustomSkills, setEditingCustomSkills] = useState(() => new Set());
  const [newCustomSkills, setNewCustomSkills] = useState(() => new Set());
  const pendingFocusKey = useRef(null);
  const editingOriginalNames = useRef({});

  const skills = useMemo(() => {
    const custom = (edited.customSkills || []).map(cs => {
      const editing = editingCustomSkills.has(cs.key);
      const isNew = newCustomSkills.has(cs.key);
      const sortLabel = (editing && !isNew && editingOriginalNames.current[cs.key] != null)
        ? editingOriginalNames.current[cs.key]
        : cs.name || '';
      return { key: cs.key, labelKey: null, label: cs.name || '', sortLabel, base: cs.base || 0, custom: true, editing, isNew };
    });
    return [...skillsData, ...custom].sort((a, b) => {
      if (a.isNew && !b.isNew) return 1;
      if (!a.isNew && b.isNew) return -1;
      const labelA = a.labelKey ? t(a.labelKey, { defaultValue: a.label }) : (a.sortLabel ?? a.label);
      const labelB = b.labelKey ? t(b.labelKey, { defaultValue: b.label }) : (b.sortLabel ?? b.label);
      return labelA.localeCompare(labelB);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, edited.customSkills, editingCustomSkills, newCustomSkills]);

  const handleAddCustomSkill = () => {
    const key = `custom_${Date.now()}`;
    setEditingCustomSkills(prev => { const next = new Set(prev); next.add(key); return next; });
    setNewCustomSkills(prev => { const next = new Set(prev); next.add(key); return next; });
    pendingFocusKey.current = key;
    onAddCustomSkill(key);
  };

  const handleRemoveCustomSkill = (key) => {
    delete editingOriginalNames.current[key];
    setEditingCustomSkills(prev => { const next = new Set(prev); next.delete(key); return next; });
    setNewCustomSkills(prev => { const next = new Set(prev); next.delete(key); return next; });
    onRemoveCustomSkill(key);
  };

  const saveCustomSkill = (key) => {
    delete editingOriginalNames.current[key];
    setEditingCustomSkills(prev => { const next = new Set(prev); next.delete(key); return next; });
    setNewCustomSkills(prev => { const next = new Set(prev); next.delete(key); return next; });
  };

  const editCustomSkill = (key, currentName) => {
    editingOriginalNames.current[key] = currentName;
    setEditingCustomSkills(prev => { const next = new Set(prev); next.add(key); return next; });
  };

  const renderSkillTable = (list) => (
    <table className="coc-skills-table2">
      <thead>
        <tr>
          <th title={t('coc.development')}><TrendingUpIcon sx={{ fontSize: 14 }} /></th>
          <th style={{ textAlign: 'left' }}>{t('coc.skill')}</th>
          <th>{t('coc.base')}</th>
          <th>{t('coc.value')}</th>
          <th>½</th>
          <th>⅕</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {list.map(skill => {
          const val = skillVal(edited, skill);
          const isFav = (edited.favoriteSkills || []).includes(skill.key);
          const isDev = (edited.developmentSkills || []).includes(skill.key);
          const baseDisplay = skill.baseLabelKey ? t(skill.baseLabelKey) : `${skill.base}%`;
          const skillLabel = skill.custom ? skill.label : t(skill.labelKey, { defaultValue: skill.label });
          const isEditing = skill.editing;
          return (
            <tr key={skill.key}>
              <td>
                {!skill.disable_development && (
                  <input
                    type="checkbox"
                    checked={isDev}
                    onChange={() => onToggleSkillFlag(skill.key, 'developmentSkills')}
                  />
                )}
              </td>
              <td
                className={`coc-skill-name-cell${isEditing ? ' coc-skill-name-cell--custom' : ''}`}
                title={!isEditing ? skillLabel : undefined}
              >
                {isEditing ? (
                  <input
                    type="text"
                    className="coc-custom-skill-name-input"
                    value={skill.label}
                    onChange={e => onUpdateCustomSkillName(skill.key, e.target.value)}
                    onClick={e => e.stopPropagation()}
                    placeholder={t('coc.customSkillNamePlaceholder')}
                    ref={el => {
                      if (el && pendingFocusKey.current === skill.key) {
                        el.focus();
                        pendingFocusKey.current = null;
                      }
                    }}
                  />
                ) : (
                  <CoCDiceModOverlay onDiceModRoll={(d) => onRollSkill(skill.key, d)} disabled={!gameId}>
                    <span style={{ display: 'block', width: '100%', height: '100%' }}>{skillLabel}</span>
                  </CoCDiceModOverlay>
                )}
              </td>
              <td className="coc-derived-cell">
                {isEditing ? (
                  <input
                    type="number"
                    value={skill.base}
                    onChange={e => onUpdateCustomSkillBase(skill.key, e.target.value)}
                    min={0}
                    max={99}
                  />
                ) : baseDisplay}
              </td>
              <td className="coc-skill-value-cell">
                <input
                  type="number"
                  value={val}
                  onChange={e => onSetSkill(skill.key, e.target.value)}
                  min={0}
                  max={99}
                />
              </td>
              <td className="coc-derived-cell">{half(val)}</td>
              <td className="coc-derived-cell">{fifth(val)}</td>
              <td>
                <div className="coc-custom-skill-actions">
                  <button
                    className={`coc-remove-btn coc-star-btn${isFav ? ' coc-star-btn--active' : ''}`}
                    onClick={() => onToggleSkillFlag(skill.key, 'favoriteSkills')}
                    title={t('coc.favorite')}
                  >
                    <StarIcon sx={{ fontSize: 14 }} />
                  </button>
                  {skill.custom && (
                    <>
                      {isEditing ? (
                        <button
                          className="coc-remove-btn"
                          onClick={() => saveCustomSkill(skill.key)}
                          title={t('coc.saveCustomSkill')}
                        >
                          <CheckIcon sx={{ fontSize: 16 }} />
                        </button>
                      ) : (
                        <button
                          className="coc-remove-btn"
                          onClick={() => editCustomSkill(skill.key, skill.label)}
                          title={t('coc.editCustomSkill')}
                        >
                          <EditIcon sx={{ fontSize: 16 }} />
                        </button>
                      )}
                      <button
                        className="coc-remove-btn"
                        onClick={() => handleRemoveCustomSkill(skill.key)}
                        title={t('coc.removeCustomSkill')}
                      >
                        <DeleteIcon sx={{ fontSize: 16 }} />
                      </button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  const half1 = Math.ceil(skills.length / 2);
  const skillsLeft = skills.slice(0, half1);
  const skillsRight = skills.slice(half1);

  return (
    <div className="coc-section">
      <h4 className="coc-section-title">{t('coc.skills')}</h4>
      <div className="coc-skills-two-col">
        {renderSkillTable(skillsLeft)}
        {renderSkillTable(skillsRight)}
      </div>
      <button className="coc-add-btn" onClick={handleAddCustomSkill}>
        + {t('coc.addCustomSkill')}
      </button>
    </div>
  );
}

export default SkillsSection;
