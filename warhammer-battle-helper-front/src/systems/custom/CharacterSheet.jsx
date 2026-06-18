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
    favoriteSkills:   stats.favoriteSkills    || [],
    weapons:          stats.weapons           || {},
    favoriteWeapons:  stats.favoriteWeapons   || [],
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
      favoriteSkills:   s.favoriteSkills    || [],
      weapons:          s.weapons           || {},
      favoriteWeapons:  s.favoriteWeapons   || [],
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
        favoriteSkills:   currentEdited.favoriteSkills,
        weapons:          currentEdited.weapons,
        favoriteWeapons:  currentEdited.favoriteWeapons,
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
    const prev = edited.skills[key] || { base: 0, advances: 0, current: 0 };
    const base = Number(value) || 0;
    const updated = { ...prev, base, current: base + (prev.advances || 0) };
    const ne = { ...edited, skills: { ...edited.skills, [key]: updated } };
    setEdited(ne);
    triggerAutoSave(ne, charNameRef.current);
  };

  const updateSkillAdvances = (key, value) => {
    const prev = edited.skills[key] || { base: 0, advances: 0, current: 0 };
    const advances = Number(value) || 0;
    const updated = { ...prev, advances, current: (prev.base || 0) + advances };
    const ne = { ...edited, skills: { ...edited.skills, [key]: updated } };
    setEdited(ne);
    triggerAutoSave(ne, charNameRef.current);
  };

  const addCustomSkillNode = (path, nodeData) => {
    const ne = {
      ...edited,
      customSkillNodes: { ...edited.customSkillNodes, [path]: nodeData },
      skills: { ...edited.skills, [path]: { base: 0, advances: 0, current: 0 } },
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

  const toggleFavoriteSkill = (skillKey) => {
    setEdited(prev => {
      const favs = prev.favoriteSkills || [];
      const next = favs.includes(skillKey)
        ? favs.filter(k => k !== skillKey)
        : [...favs, skillKey];
      const ne = { ...prev, favoriteSkills: next };
      saveCharacter(ne, charNameRef.current);
      return ne;
    });
  };

  // ---------- weapons_table handlers ----------

  const genWeaponId = () => `w_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

  const addWeaponRow = (fieldKey) => {
    const list = edited.weapons[fieldKey] || [];
    const row = { id: genWeaponId(), cells: {}, damage: {}, favorite: false };
    const ne = { ...edited, weapons: { ...edited.weapons, [fieldKey]: [...list, row] } };
    setEdited(ne);
    triggerAutoSave(ne, charNameRef.current);
  };

  // Copies a GM catalog preset into a new editable player row (snapshot — later GM edits
  // to the catalog do not touch the copy; the player owns it and may edit/remove it).
  const addWeaponFromPreset = (fieldKey, preset) => {
    const list = edited.weapons[fieldKey] || [];
    const row = {
      id: genWeaponId(),
      cells: { ...(preset.cells || {}) },
      damage: { ...(preset.damage || {}) },
      favorite: false,
    };
    const ne = { ...edited, weapons: { ...edited.weapons, [fieldKey]: [...list, row] } };
    setEdited(ne);
    triggerAutoSave(ne, charNameRef.current);
  };

  const removeWeaponRow = (fieldKey, rowId) => {
    const list = (edited.weapons[fieldKey] || []).filter(r => r.id !== rowId);
    const ne = { ...edited, weapons: { ...edited.weapons, [fieldKey]: list } };
    setEdited(ne);
    triggerAutoSave(ne, charNameRef.current);
  };

  const mapWeaponRow = (fieldKey, rowId, updater) => {
    const list = (edited.weapons[fieldKey] || []).map(r => (r.id === rowId ? updater(r) : r));
    const ne = { ...edited, weapons: { ...edited.weapons, [fieldKey]: list } };
    setEdited(ne);
    triggerAutoSave(ne, charNameRef.current);
  };

  const updateWeaponCell = (fieldKey, rowId, colKey, value) =>
    mapWeaponRow(fieldKey, rowId, r => ({ ...r, cells: { ...r.cells, [colKey]: value } }));

  const updateWeaponDamage = (fieldKey, rowId, blockId, value) =>
    mapWeaponRow(fieldKey, rowId, r => ({ ...r, damage: { ...r.damage, [blockId]: Number(value) || 0 } }));

  const toggleWeaponFavorite = (fieldKey, rowId) =>
    mapWeaponRow(fieldKey, rowId, r => ({ ...r, favorite: !r.favorite }));

  // GM preset weapons live in the template, not in stats, so their "favorite" is a per-player
  // list of preset ids rather than a flag on the row.
  const toggleWeaponPresetFavorite = (presetId) => {
    setEdited(prev => {
      const favs = prev.favoriteWeapons || [];
      const next = favs.includes(presetId) ? favs.filter(k => k !== presetId) : [...favs, presetId];
      const ne = { ...prev, favoriteWeapons: next };
      saveCharacter(ne, charNameRef.current);
      return ne;
    });
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

  const handleRollWeapon = async (fieldKey, rowId, mod = 0) => {
    if (!gameId) return;
    try {
      await fetch(`${getApiUrl()}/games/${gameId}/rollWeapon`, {
        method: 'POST',
        headers: getApiHeaders({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }),
        body: JSON.stringify({ fieldKey, weaponRowId: rowId, modifier: mod, characterId: character.id, visibility: rollVisibility }),
      });
    } catch {
      addLogMessage?.(t('combat.rollFailed'), 'error');
    }
    setRollModal(null);
    setModifier(0);
  };

  // Dispatches the modifier modal's confirm to a skill or weapon roll.
  const confirmRoll = (mod) => {
    if (rollModal?.weaponFieldKey) {
      handleRollWeapon(rollModal.weaponFieldKey, rollModal.weaponRowId, mod);
    } else {
      handleRoll(rollModal.skillKey, mod);
    }
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
      attr:          (key, val)        => updateAttr(key, val),
      advances:      (key, val)        => updateAdvances(key, val),
      skill:         (key, val)        => updateSkill(key, val),
      skillAdvances: (key, val)        => updateSkillAdvances(key, val),
      text:     (key, val)        => updateText(key, val),
      progress: (key, which, val) => updateProgress(key, which, val),
      number:   (key, val)        => updateNumber(key, val),
      weaponAdd:      (fieldKey)                     => addWeaponRow(fieldKey),
      weaponAddFromPreset: (fieldKey, preset)        => addWeaponFromPreset(fieldKey, preset),
      weaponRemove:   (fieldKey, rowId)              => removeWeaponRow(fieldKey, rowId),
      weaponCell:     (fieldKey, rowId, colKey, val) => updateWeaponCell(fieldKey, rowId, colKey, val),
      weaponDamage:   (fieldKey, rowId, blockId, val) => updateWeaponDamage(fieldKey, rowId, blockId, val),
      weaponFavorite: (fieldKey, rowId)              => toggleWeaponFavorite(fieldKey, rowId),
      weaponPresetFavorite: (presetId)               => toggleWeaponPresetFavorite(presetId),
    }}
    onRoll={setRollModal}
    favoriteWeapons={edited.favoriteWeapons}
    customSkillNodes={edited.customSkillNodes}
    onAddCustomSkill={addCustomSkillNode}
    onUpdateCustomSkill={updateCustomSkillNode}
    onRemoveCustomSkill={removeCustomSkillNode}
    favoriteSkills={edited.favoriteSkills}
    onToggleFavorite={toggleFavoriteSkill}
  />;

  return (
    <DraggablePopup
      title={template ? `${template.name} — ${charName || character?.name}` : (character?.name || '')}
      onClose={onClose}
      headerButtons={headerButtons}
      initialWidth={900}
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
                  onKeyDown={e => { if (e.key === 'Enter') confirmRoll(modifier); if (e.key === 'Escape') { setRollModal(null); setModifier(0); } }}
                />
              </div>
              <div className="custom-roll-overlay__actions">
                <button className="custom-roll-overlay__btn--cancel" onClick={() => { setRollModal(null); setModifier(0); }}>
                  {t('common.cancel')}
                </button>
                <button className="custom-roll-overlay__btn--roll" onClick={() => confirmRoll(modifier)}>
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
