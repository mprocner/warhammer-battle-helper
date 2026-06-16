import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import CasinoIcon from '@mui/icons-material/Casino';
import StarIcon from '@mui/icons-material/Star';
import CharacterHeader from '../shared/CharacterHeader';
import { getApiUrl, getApiHeaders } from '../../api/axios';
import { getCharacterSaveUrl } from '../shared/characterApi';
import CustomCharacterSheet from './CharacterSheet';

function CustomCharacterDetails({
  character,
  onCharacterUpdate,
  addLogMessage,
  gameId = null,
  token = null,
  isGM = false,
  autoOpenSheet = false,
  onSheetOpened = null,
  rollVisibility = 'all',
  game = null,
}) {
  const { t } = useTranslation();
  const [showSheet,  setShowSheet]  = useState(false);
  const [rollModal,  setRollModal]  = useState(null); // { skillKey, label }
  const [modifier,   setModifier]   = useState(0);

  const template   = game?.customSystemTemplate;
  const stats      = useMemo(() => character?.stats || {}, [character?.stats]);
  const attributes = stats.attributes || {};
  const progress   = stats.progress   || {};

  useEffect(() => {
    if (autoOpenSheet && character) {
      setShowSheet(true);
      onSheetOpened?.();
    }
  }, [autoOpenSheet, character, onSheetOpened]);

  const handleRoll = async (skillKey, mod = 0) => {
    if (!gameId || !character) return;
    try {
      await fetch(`${getApiUrl()}/games/${gameId}/rollSkill`, {
        method: 'POST',
        headers: getApiHeaders({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }),
        body: JSON.stringify({ skill: skillKey, modifier: mod, characterId: character.id, visibility: rollVisibility }),
      });
    } catch {
      addLogMessage?.(t('combat.rollFailed'), 'error');
    }
    setRollModal(null);
    setModifier(0);
  };

  const handleProgressDelta = useCallback(async (fieldKey, delta) => {
    const s = character?.stats || {};
    const prog = s.progress || {};
    const cur = prog[fieldKey] || { current: 0, max: 0 };
    const newCurrent = Math.max(0, Math.min(cur.max || 9999, (cur.current || 0) + delta));
    const updated = {
      ...character,
      stats: {
        ...s,
        progress: { ...prog, [fieldKey]: { ...cur, current: newCurrent } },
      },
    };
    onCharacterUpdate(updated);
    try {
      await fetch(`${getApiUrl()}${getCharacterSaveUrl(updated.id, gameId)}`, {
        method: 'PUT',
        headers: getApiHeaders({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }),
        body: JSON.stringify(updated),
      });
    } catch { /* silent */ }
  }, [character, gameId, token, onCharacterUpdate]);

  const allFields = template?.sections?.flatMap(s => s.fields || []) || [];
  const rollableFields = allFields.filter(f => f.type === 'attr' && f.rollable);
  const progressFields = allFields.filter(f => f.type === 'progress');

  const favoriteSkillsData = useMemo(() => {
    const favKeys = stats.favoriteSkills || [];
    if (!favKeys.length) return [];
    const allSkills = stats.skills || {};
    const customNodes = stats.customSkillNodes || {};
    const fields = template?.sections?.flatMap(s => s.fields || []) || [];

    const findNodeLabel = (nodes, targetPath, currentPrefix) => {
      for (const node of (nodes || [])) {
        const nodePath = currentPrefix ? `${currentPrefix}.${node.key}` : node.key;
        if (nodePath === targetPath) return node.label;
        const found = findNodeLabel(node.children || [], targetPath, nodePath);
        if (found) return found;
      }
      return null;
    };

    return favKeys.map(key => {
      // 1. Custom node
      if (customNodes[key]?.label) return { skillKey: key, label: customNodes[key].label, value: allSkills[key]?.current ?? allSkills[key]?.base ?? 0 };
      // 2. Skill table / Skill tree
      for (const f of fields) {
        if (f.type === 'skill_table' && key.startsWith(f.key + '.')) {
          const suffix = key.slice(f.key.length + 1);
          const opt = (f.options || []).find(o => {
            const lbl = typeof o === 'string' ? o : o.label;
            return lbl.toLowerCase().replace(/\s+/g, '_') === suffix;
          });
          if (opt) return { skillKey: key, label: typeof opt === 'string' ? opt : opt.label, value: allSkills[key]?.current ?? allSkills[key]?.base ?? 0 };
        }
        if (f.type === 'skill_tree') {
          const treeRoot = f.tree;
          const children = treeRoot?.children || (treeRoot ? [treeRoot] : []);
          const found = findNodeLabel(children, key, treeRoot?.children ? f.key : '');
          if (found) return { skillKey: key, label: found, value: allSkills[key]?.current ?? allSkills[key]?.base ?? 0 };
        }
      }
      // 3. Fallback: prettify last key segment
      const label = key.split('.').pop().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      return { skillKey: key, label, value: allSkills[key]?.current ?? allSkills[key]?.base ?? 0 };
    });
  }, [stats, template]);

  return (
    <div className="character-details custom-character-details">
      <CharacterHeader
        avatarSrc={character?.avatar}
        characterId={character?.id}
        name={character?.name}
        onOpenSheet={() => setShowSheet(true)}
        t={t}
      />

      {/* Progress fields (HP, MP, …) */}
      {progressFields.length > 0 && (
        <div className="custom-character-details__resources">
          {progressFields.map(field => {
            const val = progress[field.key] || { current: 0, max: 0 };
            return (
              <div key={field.key} className="custom-character-details__resource">
                <span className="custom-character-details__resource-label">
                  {field.abbr || field.label}
                </span>
                <div className="custom-character-details__resource-track">
                  <button
                    className="custom-character-details__resource-btn"
                    onClick={() => handleProgressDelta(field.key, -1)}
                  >−</button>
                  <span className="custom-character-details__resource-val">
                    {val.current}<span className="custom-character-details__resource-max">/{val.max}</span>
                  </span>
                  <button
                    className="custom-character-details__resource-btn"
                    onClick={() => handleProgressDelta(field.key, +1)}
                  >+</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Rollable number attributes (max 6 in compact panel) */}
      {rollableFields.length > 0 && (
        <div className="custom-character-details__attrs">
          {rollableFields.slice(0, 6).map(field => (
            <div key={field.key} className="custom-character-details__attr">
              <span className="custom-character-details__attr-abbr">
                {field.abbr || field.label}
              </span>
              <span className="custom-character-details__attr-val">
                {attributes[field.key]?.current ?? 0}
              </span>
              <button
                className="custom-character-details__roll-btn"
                onClick={() => setRollModal({ skillKey: field.key, label: field.label })}
              >
                <CasinoIcon style={{ fontSize: 14 }} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Favourite skills */}
      {favoriteSkillsData.length > 0 && (
        <div className="custom-character-details__favorites">
          <div className="custom-character-details__favorites-label">
            <StarIcon style={{ fontSize: 11, verticalAlign: 'middle', marginRight: 4 }} />
            {t('character.favoriteSkills')}
          </div>
          {favoriteSkillsData.map(s => (
            <button
              key={s.skillKey}
              className="custom-character-details__favorite-item"
              onClick={() => setRollModal({ skillKey: s.skillKey, label: s.label })}
              disabled={!gameId}
            >
              <span className="custom-character-details__favorite-label">{s.label}</span>
              <span className="custom-character-details__favorite-value">{s.value}</span>
            </button>
          ))}
        </div>
      )}

      {/* Modifier overlay */}
      {rollModal && (
        <div className="custom-roll-overlay">
          <div className="custom-roll-overlay__backdrop" onClick={() => { setRollModal(null); setModifier(0); }} />
          <div className="custom-roll-overlay__card">
            <div className="custom-roll-overlay__title">
              {t('combat.rollFor')}: <strong>{rollModal.label}</strong>
            </div>
            <div className="custom-roll-overlay__row">
              <label className="custom-roll-overlay__label">{t('combat.modifier')}</label>
              <input
                type="number"
                className="custom-roll-overlay__input"
                value={modifier}
                onChange={e => setModifier(Number(e.target.value))}
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter') handleRoll(rollModal.skillKey, modifier);
                  if (e.key === 'Escape') { setRollModal(null); setModifier(0); }
                }}
              />
            </div>
            <div className="custom-roll-overlay__actions">
              <button className="custom-roll-overlay__btn--cancel" onClick={() => { setRollModal(null); setModifier(0); }}>
                {t('common.cancel')}
              </button>
              <button className="custom-roll-overlay__btn--roll" onClick={() => handleRoll(rollModal.skillKey, modifier)}>
                <CasinoIcon style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }} />
                {t('combat.roll')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full sheet popup */}
      {showSheet && (
        <CustomCharacterSheet
          character={character}
          onClose={() => setShowSheet(false)}
          onCharacterUpdate={onCharacterUpdate}
          addLogMessage={addLogMessage}
          gameId={gameId}
          token={token}
          isGM={isGM}
          rollVisibility={rollVisibility}
          game={game}
        />
      )}
    </div>
  );
}

export default CustomCharacterDetails;
