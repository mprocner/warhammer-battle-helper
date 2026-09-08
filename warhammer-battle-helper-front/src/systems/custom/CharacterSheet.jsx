import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import DraggablePopup from '../../components/common/DraggablePopup';
import { usePopOut, useCharacterSheetHeaderButtons } from '../shared/useCharacterSheetActions';
import { getApiUrl, getApiHeaders } from '../../api/axios';
import { getCharacterSaveUrl } from '../shared/characterApi';
import CustomSheetBody from './CustomSheetBody';
import RollModifierOverlay from './RollModifierOverlay';
import { useRollPrompt } from './useRollPrompt';

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

  const autoSaveTimer  = useRef(null);
  const charNameRef    = useRef(charName);
  const prevCharIdRef  = useRef(character?.id);
  // Czy mamy edycje jeszcze niezapisane na serwerze. Ustawiane przy każdej zmianie
  // pola, zdejmowane dopiero po udanym zapisie — po nieudanym zostaje, żeby przychodzące
  // dane nie skasowały tego, czego nie udało się utrwalić.
  const dirtyRef       = useRef(false);

  // Re-sync z propsa przy zmianie postaci, a dla tej samej postaci tylko wtedy, gdy
  // nie mamy niezapisanych edycji.
  //
  // Oba warunki są potrzebne. Bez drugiego refetch po evencie WS (np. po rzucie innego
  // gracza) kasowałby tekst wpisywany właśnie w tej karcie. Bez pierwszego karta nie
  // pokazywałaby zmian tej samej postaci wprowadzonych gdzie indziej — a od FEATURE-172
  // ta sama postać bywa otwarta w dwóch oknach naraz.
  useEffect(() => {
    const isSameCharacter = character?.id === prevCharIdRef.current;
    if (isSameCharacter && dirtyRef.current) return;
    prevCharIdRef.current = character?.id;
    if (!isSameCharacter) dirtyRef.current = false;
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
      // Dopiero teraz nasze edycje są na serwerze, więc przychodzące dane mogą
      // je nadpisać. Przy błędzie zapisu flaga zostaje — lokalna wersja jest
      // wtedy jedyną, która istnieje.
      dirtyRef.current = false;
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
    dirtyRef.current = true;
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
    const row = { id: genWeaponId(), cells: {}, damage: {} };
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
    };
    const ne = { ...edited, weapons: { ...edited.weapons, [fieldKey]: [...list, row] } };
    setEdited(ne);
    triggerAutoSave(ne, charNameRef.current);
  };

  const removeWeaponRow = (fieldKey, rowId) => {
    const list = (edited.weapons[fieldKey] || []).filter(r => r.id !== rowId);
    // Drop the removed row from favorites too, so CharacterDetails doesn't keep a dangling id.
    const favoriteWeapons = (edited.favoriteWeapons || []).filter(id => id !== rowId);
    const ne = { ...edited, weapons: { ...edited.weapons, [fieldKey]: list }, favoriteWeapons };
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

  // Weapon favorites are tracked by weapon id in favoriteWeapons — for player rows and GM
  // presets alike — so CharacterDetails can resolve and roll either kind the same way. (Preset
  // weapons live in the template, not in stats, so a per-player id list is the only place to
  // mark them; player rows reuse the same list for consistency.)
  const toggleWeaponFavorite = (weaponId) => {
    setEdited(prev => {
      const favs = prev.favoriteWeapons || [];
      const next = favs.includes(weaponId) ? favs.filter(k => k !== weaponId) : [...favs, weaponId];
      const ne = { ...prev, favoriteWeapons: next };
      saveCharacter(ne, charNameRef.current);
      return ne;
    });
  };

  const handleRoll = useCallback(async (skillKey, mod = 0) => {
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
  }, [gameId, character, token, rollVisibility, addLogMessage, t]);

  const handleRollWeapon = useCallback(async (fieldKey, rowId, mod = 0) => {
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
  }, [gameId, character, token, rollVisibility, addLogMessage, t]);

  // Hook woła to z requestem, który wcześniej dostał od przycisku, i z zatwierdzonym
  // modyfikatorem; rozdział na rzut umiejętności i broni zostaje tutaj, bo tylko ta warstwa
  // wie, który endpoint jest który.
  const dispatchRoll = useCallback((request, mod) => {
    if (request.weaponFieldKey) {
      handleRollWeapon(request.weaponFieldKey, request.weaponRowId, mod);
    } else {
      handleRoll(request.skillKey, mod);
    }
  }, [handleRoll, handleRollWeapon]);

  const { modifierConfig, pending, promptRoll, cancelRoll, confirmRoll } = useRollPrompt(template, dispatchRoll);

  const handlePopOut = usePopOut(character?.id, gameId, rollVisibility);
  const headerButtons = useCharacterSheetHeaderButtons({
    isSaving, saveSuccess, isStandalone,
    onSave: () => saveCharacter(edited, charNameRef.current),
    onPopOut: () => { handlePopOut(); onClose?.(); },
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
      weaponFavorite: (weaponId)                     => toggleWeaponFavorite(weaponId),
    }}
    onRoll={promptRoll}
    favoriteWeapons={edited.favoriteWeapons}
    customSkillNodes={edited.customSkillNodes}
    onAddCustomSkill={addCustomSkillNode}
    onUpdateCustomSkill={updateCustomSkillNode}
    onRemoveCustomSkill={removeCustomSkillNode}
    favoriteSkills={edited.favoriteSkills}
    onToggleFavorite={toggleFavoriteSkill}
  />;

  const sheetContent = (
    <div className="custom-sheet">
      {/* Pytanie o modyfikator — renderuje się tylko wtedy, gdy szablon go włącza. */}
      {pending && modifierConfig && (
        <RollModifierOverlay
          label={pending.label}
          config={modifierConfig}
          onConfirm={confirmRoll}
          onCancel={cancelRoll}
        />
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
  );

  // Osobne okno (/character-sheet) żyje poza WindowManagerProvider, więc DraggablePopup
  // — a przez niego useWindowManager — nie może się tam znaleźć. Tak samo robią
  // warhammer4e, coc7e i dnd5e.
  if (isStandalone) {
    return (
      <div className="sheet-standalone character-sheet-popup">
        <div className="sheet-standalone__content">{sheetContent}</div>
      </div>
    );
  }

  return (
    <DraggablePopup
      title={template ? `${template.name} — ${charName || character?.name}` : (character?.name || '')}
      onClose={onClose}
      headerButtons={headerButtons}
      initialWidth={900}
      windowId={`characterSheet:${character.id}`}
      windowKind="characterSheet"
    >
      {sheetContent}
    </DraggablePopup>
  );
}

export default CustomCharacterSheet;
