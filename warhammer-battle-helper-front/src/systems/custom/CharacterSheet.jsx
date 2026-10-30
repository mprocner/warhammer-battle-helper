import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import DraggablePopup from '../../components/common/DraggablePopup';
import { usePopOut, useCharacterSheetHeaderButtons } from '../shared/useCharacterSheetActions';
import { getApiUrl, getApiHeaders } from '../../api/axios';
import { getCharacterSaveUrl } from '../shared/characterApi';
import CustomSheetBody from './CustomSheetBody';
import RollModifierOverlay from './RollModifierOverlay';
import { useRollPrompt } from './useRollPrompt';
import { postRoll } from './postRoll';
import { clampSheetWidth } from '../../utils/sheetWidth';

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
    developmentSkills: stats.developmentSkills || [],
    weapons:          stats.weapons           || {},
    favoriteWeapons:  stats.favoriteWeapons   || [],
    tables:           stats.tables            || {},
    images:           stats.images            || {},
  });
  const [charName,   setCharName]   = useState(character?.name   || '');
  const [charAvatar, setCharAvatar] = useState(character?.avatar || '');
  const [isSaving,   setIsSaving]   = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const autoSaveTimer  = useRef(null);
  const charNameRef    = useRef(charName);
  const charAvatarRef  = useRef(charAvatar);
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
      developmentSkills: s.developmentSkills || [],
      weapons:          s.weapons           || {},
      favoriteWeapons:  s.favoriteWeapons   || [],
      tables:           s.tables            || {},
      images:           s.images            || {},
    });
    setCharName(character?.name || '');
    charNameRef.current = character?.name || '';
    setCharAvatar(character?.avatar || '');
    charAvatarRef.current = character?.avatar || '';
  }, [character]);

  // Name and avatar are read from refs rather than passed in: they change through their own
  // fields, and every save — whichever field triggered it — must carry their latest values.
  const saveCharacter = useCallback(async (currentEdited) => {
    if (!gameId) return;
    setIsSaving(true);
    const updated = {
      ...character,
      name: charNameRef.current,
      avatar: charAvatarRef.current,
      stats: {
        attributes:       currentEdited.attributes,
        skills:           currentEdited.skills,
        texts:            currentEdited.texts,
        progress:         currentEdited.progress,
        numbers:          currentEdited.numbers,
        customSkillNodes: currentEdited.customSkillNodes,
        favoriteSkills:   currentEdited.favoriteSkills,
        developmentSkills: currentEdited.developmentSkills,
        weapons:          currentEdited.weapons,
        favoriteWeapons:  currentEdited.favoriteWeapons,
        tables:           currentEdited.tables,
        images:           currentEdited.images,
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

  const triggerAutoSave = useCallback((e) => {
    dirtyRef.current = true;
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => saveCharacter(e), 800);
  }, [saveCharacter]);

  const updateAttr = (key, value) => {
    const prev = edited.attributes[key] || { base: 0, advances: 0, current: 0 };
    const base = Number(value) || 0;
    const updated = { ...prev, base, current: base + prev.advances };
    const ne = { ...edited, attributes: { ...edited.attributes, [key]: updated } };
    setEdited(ne);
    triggerAutoSave(ne);
  };

  const updateAdvances = (key, value) => {
    const prev = edited.attributes[key] || { base: 0, advances: 0, current: 0 };
    const advances = Number(value) || 0;
    const updated = { ...prev, advances, current: prev.base + advances };
    const ne = { ...edited, attributes: { ...edited.attributes, [key]: updated } };
    setEdited(ne);
    triggerAutoSave(ne);
  };

  const updateSkill = (key, value) => {
    const prev = edited.skills[key] || { base: 0, advances: 0, current: 0 };
    const base = Number(value) || 0;
    const updated = { ...prev, base, current: base + (prev.advances || 0) };
    const ne = { ...edited, skills: { ...edited.skills, [key]: updated } };
    setEdited(ne);
    triggerAutoSave(ne);
  };

  const updateSkillAdvances = (key, value) => {
    const prev = edited.skills[key] || { base: 0, advances: 0, current: 0 };
    const advances = Number(value) || 0;
    const updated = { ...prev, advances, current: (prev.base || 0) + advances };
    const ne = { ...edited, skills: { ...edited.skills, [key]: updated } };
    setEdited(ne);
    triggerAutoSave(ne);
  };

  const addCustomSkillNode = (path, nodeData) => {
    const ne = {
      ...edited,
      customSkillNodes: { ...edited.customSkillNodes, [path]: nodeData },
      skills: { ...edited.skills, [path]: { base: 0, advances: 0, current: 0 } },
    };
    setEdited(ne);
    triggerAutoSave(ne);
  };

  const updateCustomSkillNode = (path, nodeData) => {
    const ne = { ...edited, customSkillNodes: { ...edited.customSkillNodes, [path]: nodeData } };
    setEdited(ne);
    triggerAutoSave(ne);
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
    triggerAutoSave(ne);
  };

  const updateNumber = (key, value) => {
    const ne = { ...edited, numbers: { ...edited.numbers, [key]: Number(value) || 0 } };
    setEdited(ne);
    triggerAutoSave(ne);
  };

  const updateName = (value) => {
    setCharName(value);
    charNameRef.current = value;
    triggerAutoSave(edited);
  };

  // An upload is a finished, one-click action like a favourite, so it saves straight away
  // instead of waiting out the autosave debounce. Both handlers run after an async upload, from
  // the render where the crop was confirmed, so `edited` in their closure is stale: they read the
  // latest state through the functional updater (as toggleFavoriteSkill does). They also cancel
  // the pending autosave: this save already carries the latest stats, name and avatar, and an
  // older timer firing afterwards would overwrite it on the server.
  const updateAvatar = (url) => {
    setCharAvatar(url);
    charAvatarRef.current = url;
    clearTimeout(autoSaveTimer.current);
    setEdited(prev => {
      saveCharacter(prev);
      return prev;
    });
  };

  const updateImage = (key, url) => {
    clearTimeout(autoSaveTimer.current);
    setEdited(prev => {
      const images = { ...prev.images };
      if (url) images[key] = url;
      else delete images[key];
      const ne = { ...prev, images };
      saveCharacter(ne);
      return ne;
    });
  };

  const uploadImage = useCallback(async (file) => {
    const formData = new FormData();
    formData.append('avatar', file, file.name);
    const res = await fetch(`${getApiUrl()}/avatars`, {
      method: 'POST',
      headers: getApiHeaders({ 'Authorization': `Bearer ${token}` }),
      body: formData,
    });
    if (!res.ok) throw new Error('Upload failed');
    const data = await res.json();
    return data.url;
  }, [token]);

  const updateText = (key, value) => {
    const ne = { ...edited, texts: { ...edited.texts, [key]: value } };
    setEdited(ne);
    triggerAutoSave(ne);
  };

  const updateProgress = (key, which, value) => {
    const prev = edited.progress[key] || { current: 0, max: 0 };
    const ne = { ...edited, progress: { ...edited.progress, [key]: { ...prev, [which]: Number(value) || 0 } } };
    setEdited(ne);
    triggerAutoSave(ne);
  };

  const toggleFavoriteSkill = (skillKey) => {
    setEdited(prev => {
      const favs = prev.favoriteSkills || [];
      const next = favs.includes(skillKey)
        ? favs.filter(k => k !== skillKey)
        : [...favs, skillKey];
      const ne = { ...prev, favoriteSkills: next };
      saveCharacter(ne);
      return ne;
    });
  };

  // Marking a skill for improvement is a one-click preference like a favourite, not a typed value,
  // so it saves straight away instead of going through the autosave debounce.
  const toggleDevelopmentSkill = (skillKey) => {
    setEdited(prev => {
      const marked = prev.developmentSkills || [];
      const next = marked.includes(skillKey)
        ? marked.filter(k => k !== skillKey)
        : [...marked, skillKey];
      const ne = { ...prev, developmentSkills: next };
      saveCharacter(ne);
      return ne;
    });
  };

  // ---------- row tables (weapons_table, data_table) ----------
  // Both store player rows as edited[storeKey][fieldKey] = [{ id, cells, … }]. The helpers below
  // own that shape; the per-table handlers only say which store and what a new row looks like.

  const genRowId = (prefix) => `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

  const withRows = (base, storeKey, fieldKey, rows) =>
    ({ ...base, [storeKey]: { ...base[storeKey], [fieldKey]: rows } });

  const commitEdited = (ne) => {
    setEdited(ne);
    triggerAutoSave(ne);
  };

  const rowsOf = (storeKey, fieldKey) => edited[storeKey][fieldKey] || [];

  // Returns the new row's id so the table can open it straight into edit mode.
  const addRow = (storeKey, fieldKey, row) => {
    commitEdited(withRows(edited, storeKey, fieldKey, [...rowsOf(storeKey, fieldKey), row]));
    return row.id;
  };

  const mapRow = (storeKey, fieldKey, rowId, updater) =>
    commitEdited(withRows(edited, storeKey, fieldKey, rowsOf(storeKey, fieldKey).map(r => (r.id === rowId ? updater(r) : r))));

  const removeRow = (storeKey, fieldKey, rowId, extra = {}) =>
    commitEdited({ ...withRows(edited, storeKey, fieldKey, rowsOf(storeKey, fieldKey).filter(r => r.id !== rowId)), ...extra });

  const setCell = (colKey, value) => r => ({ ...r, cells: { ...r.cells, [colKey]: value } });

  // weapons_table. A catalog preset is copied (snapshot — later GM edits to the catalog do not
  // touch the copy; the player owns it and may edit/remove it).
  const addWeaponRow = (fieldKey) => addRow('weapons', fieldKey, { id: genRowId('w'), cells: {}, damage: {} });
  const addWeaponFromPreset = (fieldKey, preset) => addRow('weapons', fieldKey, {
    id: genRowId('w'),
    cells: { ...(preset.cells || {}) },
    damage: { ...(preset.damage || {}) },
  });
  // Drop the removed row from favorites too, so CharacterDetails doesn't keep a dangling id.
  const removeWeaponRow = (fieldKey, rowId) => removeRow('weapons', fieldKey, rowId, {
    favoriteWeapons: (edited.favoriteWeapons || []).filter(id => id !== rowId),
  });
  const updateWeaponCell = (fieldKey, rowId, colKey, value) => mapRow('weapons', fieldKey, rowId, setCell(colKey, value));
  const updateWeaponDamage = (fieldKey, rowId, blockId, value) =>
    mapRow('weapons', fieldKey, rowId, r => ({ ...r, damage: { ...r.damage, [blockId]: value } }));

  // data_table
  const addTableRow = (fieldKey) => addRow('tables', fieldKey, { id: genRowId('r'), cells: {} });
  const addTableRowFromPreset = (fieldKey, preset) =>
    addRow('tables', fieldKey, { id: genRowId('r'), cells: { ...(preset.cells || {}) } });
  const removeTableRow = (fieldKey, rowId) => removeRow('tables', fieldKey, rowId);
  const updateTableCell = (fieldKey, rowId, colKey, value) => mapRow('tables', fieldKey, rowId, setCell(colKey, value));

  // Weapon favorites are tracked by row id in favoriteWeapons, so CharacterDetails can resolve and
  // roll them.
  const toggleWeaponFavorite = (weaponId) => {
    setEdited(prev => {
      const favs = prev.favoriteWeapons || [];
      const next = favs.includes(weaponId) ? favs.filter(k => k !== weaponId) : [...favs, weaponId];
      const ne = { ...prev, favoriteWeapons: next };
      saveCharacter(ne);
      return ne;
    });
  };

  const handleRoll = useCallback(async (skillKey, mod = 0) => {
    if (!gameId) return;
    await postRoll(gameId, 'rollSkill', token, { skill: skillKey, modifier: mod, characterId: character.id, visibility: rollVisibility },
      () => addLogMessage?.(t('combat.rollFailed'), 'error'));
  }, [gameId, character, token, rollVisibility, addLogMessage, t]);

  const handleRollWeapon = useCallback(async (fieldKey, rowId, mod = 0) => {
    if (!gameId) return;
    await postRoll(gameId, 'rollWeapon', token, { fieldKey, weaponRowId: rowId, modifier: mod, characterId: character.id, visibility: rollVisibility },
      () => addLogMessage?.(t('combat.rollFailed'), 'error'));
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
    onSave: () => saveCharacter(edited),
    onPopOut: () => { handlePopOut(); onClose?.(); },
    t,
  });

  // ---------- render ----------
  // Single source of truth for the sheet's design width: feeds both the popup's opening
  // width and the content wrapper's max-width below, so they can never disagree.
  const sheetWidth = clampSheetWidth(template?.settings?.sheetWidth);

  const renderBody = () => <CustomSheetBody
    sections={template.sections}
    values={{ ...edited, name: charName, avatar: charAvatar }}
    onChange={{
      attr:          (key, val)        => updateAttr(key, val),
      advances:      (key, val)        => updateAdvances(key, val),
      skill:         (key, val)        => updateSkill(key, val),
      skillAdvances: (key, val)        => updateSkillAdvances(key, val),
      text:     (key, val)        => updateText(key, val),
      progress: (key, which, val) => updateProgress(key, which, val),
      number:   (key, val)        => updateNumber(key, val),
      name:     (val)             => updateName(val),
      avatar:   (url)             => updateAvatar(url),
      image:    (key, url)        => updateImage(key, url),
      weaponAdd:      (fieldKey)                     => addWeaponRow(fieldKey),
      weaponAddFromPreset: (fieldKey, preset)        => addWeaponFromPreset(fieldKey, preset),
      weaponRemove:   (fieldKey, rowId)              => removeWeaponRow(fieldKey, rowId),
      weaponCell:     (fieldKey, rowId, colKey, val) => updateWeaponCell(fieldKey, rowId, colKey, val),
      weaponDamage:   (fieldKey, rowId, blockId, val) => updateWeaponDamage(fieldKey, rowId, blockId, val),
      weaponFavorite: (weaponId)                     => toggleWeaponFavorite(weaponId),
      tableAdd:           (fieldKey)                     => addTableRow(fieldKey),
      tableAddFromPreset: (fieldKey, preset)             => addTableRowFromPreset(fieldKey, preset),
      tableCell:          (fieldKey, rowId, colKey, val) => updateTableCell(fieldKey, rowId, colKey, val),
      tableRemove:        (fieldKey, rowId)              => removeTableRow(fieldKey, rowId),
    }}
    onRoll={promptRoll}
    favoriteWeapons={edited.favoriteWeapons}
    customSkillNodes={edited.customSkillNodes}
    onAddCustomSkill={addCustomSkillNode}
    onUpdateCustomSkill={updateCustomSkillNode}
    onRemoveCustomSkill={removeCustomSkillNode}
    favoriteSkills={edited.favoriteSkills}
    onToggleFavorite={toggleFavoriteSkill}
    developmentSkills={edited.developmentSkills}
    onToggleDevelopment={toggleDevelopmentSkill}
    uploadImage={uploadImage}
  />;

  const sheetContent = (
    <div className="custom-sheet" style={{ maxWidth: sheetWidth }}>
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
      ) : renderBody()}
    </div>
  );

  // Osobne okno (/character-sheet) żyje poza WindowManagerProvider, więc DraggablePopup
  // — a przez niego useWindowManager — nie może się tam znaleźć. Tak samo robią
  // warhammer4e, coc7e i srd5.
  if (isStandalone) {
    return (
      <div className="sheet-standalone character-sheet-popup">
        <div className="sheet-standalone__content">{sheetContent}</div>
      </div>
    );
  }

  return (
    <DraggablePopup
      title={charName || character?.name || ''}
      onClose={onClose}
      headerButtons={headerButtons}
      initialWidth={sheetWidth}
      windowId={`characterSheet:${character.id}`}
      windowKind="characterSheet"
    >
      {sheetContent}
    </DraggablePopup>
  );
}

export default CustomCharacterSheet;
