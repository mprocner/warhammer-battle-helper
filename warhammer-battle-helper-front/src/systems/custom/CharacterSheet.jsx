import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import CasinoIcon from '@mui/icons-material/Casino';
import DraggablePopup from '../../components/common/DraggablePopup';
import { usePopOut, useCharacterSheetHeaderButtons } from '../shared/useCharacterSheetActions';
import { getApiUrl, getApiHeaders } from '../../api/axios';
import { getCharacterSaveUrl } from '../shared/characterApi';
import CustomSheetBody from './CustomSheetBody';

function CustomCharacterSheet({
  character,
  onClose,
  onCharacterUpdate,
  addLogMessage,
  gameId,
  token,
  isGM = false,
  isStandalone = false,
  rollVisibility = 'all',
  game = null,
}) {
  const { t } = useTranslation();
  const template = game?.customSystemTemplate;
  const stats = character?.stats || {};

  const [edited, setEdited] = useState({
    attributes:       stats.attributes        || {},
    skills:           stats.skills            || {},
    texts:            stats.texts             || {},
    progress:         stats.progress          || {},
    numbers:          stats.numbers           || {},
    customSkillNodes: stats.customSkillNodes  || {},
  });
  const [charName,   setCharName]   = useState(character?.name   || '');
  const [isSaving,   setIsSaving]   = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [rollModal,  setRollModal]  = useState(null); // { skillKey, label }
  const [modifier,   setModifier]   = useState(0);

  const autoSaveTimer  = useRef(null);
  const charNameRef    = useRef(charName);

  useEffect(() => {
    const s = character?.stats || {};
    setEdited({
      attributes:       s.attributes        || {},
      skills:           s.skills            || {},
      texts:            s.texts             || {},
      progress:         s.progress          || {},
      numbers:          s.numbers           || {},
      customSkillNodes: s.customSkillNodes  || {},
    });
    setCharName(character?.name || '');
    charNameRef.current = character?.name || '';
  }, [character]);

  const saveCharacter = useCallback(async (currentEdited, name) => {
    if (!gameId) return;
    setIsSaving(true);
    const updated = {
      ...character,
      name,
      stats: {
        attributes:       currentEdited.attributes,
        skills:           currentEdited.skills,
        texts:            currentEdited.texts,
        progress:         currentEdited.progress,
        numbers:          currentEdited.numbers,
        customSkillNodes: currentEdited.customSkillNodes,
      },
    };
    try {
      const res = await fetch(`${getApiUrl()}${getCharacterSaveUrl(updated.id, gameId)}`, {
        method: 'PUT',
        headers: getApiHeaders({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }),
        body: JSON.stringify(updated),
      });
      if (!res.ok) throw new Error('Save failed');
      onCharacterUpdate(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch {
      addLogMessage?.(t('character.saveFailed'), 'error');
    } finally {
      setIsSaving(false);
    }
  }, [character, gameId, token, onCharacterUpdate, addLogMessage, t]);

  const triggerAutoSave = useCallback((e, name) => {
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => saveCharacter(e, name), 800);
  }, [saveCharacter]);

  const updateAttr = (key, value) => {
    const prev = edited.attributes[key] || { base: 0, advances: 0, current: 0 };
    const base = Number(value) || 0;
    const updated = { ...prev, base, current: base + prev.advances };
    const ne = { ...edited, attributes: { ...edited.attributes, [key]: updated } };
    setEdited(ne);
    triggerAutoSave(ne, charNameRef.current);
  };

  const updateAdvances = (key, value) => {
    const prev = edited.attributes[key] || { base: 0, advances: 0, current: 0 };
    const advances = Number(value) || 0;
    const updated = { ...prev, advances, current: prev.base + advances };
    const ne = { ...edited, attributes: { ...edited.attributes, [key]: updated } };
    setEdited(ne);
    triggerAutoSave(ne, charNameRef.current);
  };

  const updateSkill = (key, value) => {
    const ne = { ...edited, skills: { ...edited.skills, [key]: Number(value) || 0 } };
    setEdited(ne);
    triggerAutoSave(ne, charNameRef.current);
  };

  const addCustomSkillNode = (path, nodeData) => {
    const ne = {
      ...edited,
      customSkillNodes: { ...edited.customSkillNodes, [path]: nodeData },
      skills: { ...edited.skills, [path]: 0 },
    };
    setEdited(ne);
    triggerAutoSave(ne, charNameRef.current);
  };

  const updateCustomSkillNode = (path, nodeData) => {
    const ne = { ...edited, customSkillNodes: { ...edited.customSkillNodes, [path]: nodeData } };
    setEdited(ne);
    triggerAutoSave(ne, charNameRef.current);
  };

  const removeCustomSkillNode = (path) => {
    const nextNodes  = { ...edited.customSkillNodes };
    const nextSkills = { ...edited.skills };
    // Remove the node and all its descendants (recursive subtree).
    Object.keys(nextNodes).forEach(k => {
      if (k === path || k.startsWith(path + '.')) { delete nextNodes[k]; delete nextSkills[k]; }
    });
    const ne = { ...edited, customSkillNodes: nextNodes, skills: nextSkills };
    setEdited(ne);
    triggerAutoSave(ne, charNameRef.current);
  };

  const updateNumber = (key, value) => {
    const ne = { ...edited, numbers: { ...edited.numbers, [key]: Number(value) || 0 } };
    setEdited(ne);
    triggerAutoSave(ne, charNameRef.current);
  };

  const updateText = (key, value) => {
    const ne = { ...edited, texts: { ...edited.texts, [key]: value } };
    setEdited(ne);
    triggerAutoSave(ne, charNameRef.current);
  };

  const updateProgress = (key, which, value) => {
    const prev = edited.progress[key] || { current: 0, max: 0 };
    const ne = { ...edited, progress: { ...edited.progress, [key]: { ...prev, [which]: Number(value) || 0 } } };
    setEdited(ne);
    triggerAutoSave(ne, charNameRef.current);
  };

  const handleRoll = async (skillKey, mod = 0) => {
    if (!gameId) return;
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

  const handlePopOut = usePopOut(character?.id, gameId);
  const headerButtons = useCharacterSheetHeaderButtons({
    isSaving, saveSuccess, isStandalone,
    onSave: () => saveCharacter(edited, charNameRef.current),
    onPopOut: handlePopOut,
    t,
  });

  // ---------- render ----------
  const renderBody = () => <CustomSheetBody
    sections={template.sections}
    values={edited}
    onChange={{
      attr:     (key, val)        => updateAttr(key, val),
      advances: (key, val)        => updateAdvances(key, val),
      skill:    (key, val)        => updateSkill(key, val),
      text:     (key, val)        => updateText(key, val),
      progress: (key, which, val) => updateProgress(key, which, val),
      number:   (key, val)        => updateNumber(key, val),
    }}
    onRoll={setRollModal}
    customSkillNodes={edited.customSkillNodes}
    onAddCustomSkill={addCustomSkillNode}
    onUpdateCustomSkill={updateCustomSkillNode}
    onRemoveCustomSkill={removeCustomSkillNode}
  />;

  return (
    <DraggablePopup
      title={template ? `${template.name} — ${charName || character?.name}` : (character?.name || '')}
      onClose={onClose}
      headerButtons={headerButtons}
    >
      <div className="custom-sheet">
        {/* Roll modifier modal */}
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
                  onKeyDown={e => { if (e.key === 'Enter') handleRoll(rollModal.skillKey, modifier); if (e.key === 'Escape') { setRollModal(null); setModifier(0); } }}
                />
              </div>
              <div className="custom-roll-overlay__actions">
                <button className="custom-roll-overlay__btn--cancel" onClick={() => { setRollModal(null); setModifier(0); }}>
                  {t('common.cancel')}
                </button>
                <button className="custom-roll-overlay__btn--roll" onClick={() => handleRoll(rollModal.skillKey, modifier)}>
                  <CasinoIcon style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 4 }} />
                  {t('combat.roll')}
                </button>
              </div>
            </div>
          </div>
        )}

        {!template ? (
          <div className="custom-sheet__no-template">{t('creator.noTemplate')}</div>
        ) : (
          <>
            {/* Character name */}
            <div className="custom-sheet__char-header">
              <input
                className="custom-sheet__char-name-input"
                value={charName}
                onChange={e => {
                  setCharName(e.target.value);
                  charNameRef.current = e.target.value;
                  triggerAutoSave(edited, e.target.value);
                }}
                placeholder={t('character.name')}
              />
              <span className="custom-sheet__template-name">{template.name}</span>
            </div>

            {renderBody()}
          </>
        )}
      </div>
    </DraggablePopup>
  );
}

export default CustomCharacterSheet;
