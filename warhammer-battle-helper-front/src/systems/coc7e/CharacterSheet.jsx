import React, { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { usePopOut, useCharacterSheetHeaderButtons } from '../shared/useCharacterSheetActions';
import DraggablePopup from '../../components/common/DraggablePopup';
import axiosInstance from '../../api/axios';
import { getApiUrl, getApiHeaders } from '../../api/axios';
import { getCharacterSaveUrl as getCharacterSaveUrlBase } from '../shared/characterApi';

import CharacterInfoSection from './sections/CharacterInfoSection';
import ResourcesSection from './sections/ResourcesSection';
import AttributesSection from './sections/AttributesSection';
import SkillsSection from './sections/SkillsSection';
import WeaponsSection from './sections/WeaponsSection';
import EquipmentSection from './sections/EquipmentSection';
import BackgroundSection from './sections/BackgroundSection';

const DEFAULT_UNARMED = { name: 'nieuzbrojony', damage: '1K3 + MO', range: '', attacks: 1, ammo: '', malfunction: '', skillKey: 'fighting_brawl' };

function CoCCharacterSheet({ character, onClose, onCharacterUpdate, addLogMessage, gameId, token, isGM = false, isStandalone = false, rollVisibility = 'all' }) {
  const { t } = useTranslation();
  const stats = character.stats || {};

  const [edited, setEdited] = useState(() => {
    const weps = stats.weapons || [];
    const first = weps[0] || {};
    return {
      ...stats,
      basicInfo:         stats.basicInfo         || {},
      attributes:        stats.attributes        || {},
      resources:         stats.resources         || {},
      combat:            stats.combat            || {},
      finances:          stats.finances          || {},
      background:        stats.background        || {},
      skills:            stats.skills            || {},
      customSkills:      stats.customSkills      || [],
      favoriteSkills:    stats.favoriteSkills    || [],
      developmentSkills: stats.developmentSkills || [],
      weapons: [
        { ...DEFAULT_UNARMED, ...first, name: first.name || DEFAULT_UNARMED.name },
        ...weps.slice(1)
      ],
    };
  });
  const [charName, setCharName] = useState(character.name || '');
  const [charAvatar, setCharAvatar] = useState(character.avatar || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Sync all fields when character prop changes (external update via WS or left panel)
  React.useEffect(() => {
    const s = character.stats || {};
    const weps = s.weapons || [];
    const first = weps[0] || {};
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = null;
    }
    setEdited({
      ...s,
      basicInfo:         s.basicInfo         || {},
      attributes:        s.attributes        || {},
      resources:         s.resources         || {},
      combat:            s.combat            || {},
      finances:          s.finances          || {},
      background:        s.background        || {},
      skills:            s.skills            || {},
      customSkills:      s.customSkills      || [],
      favoriteSkills:    s.favoriteSkills    || [],
      developmentSkills: s.developmentSkills || [],
      weapons: [
        { ...DEFAULT_UNARMED, ...first, name: first.name || DEFAULT_UNARMED.name },
        ...weps.slice(1),
      ],
    });
    setCharName(character.name || '');
    setCharAvatar(character.avatar || '');
    charNameRef.current = character.name || '';
    charAvatarRef.current = character.avatar || '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character]);

  const autoSaveTimer = useRef(null);
  const charNameRef = useRef(character.name || '');
  const charAvatarRef = useRef(character.avatar || '');

  const getCharacterSaveUrl = useCallback((charId) => getCharacterSaveUrlBase(charId, gameId), [gameId]);

  const saveCharacter = useCallback(async (payload) => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const response = await axiosInstance.put(getCharacterSaveUrl(character.id), payload);
      const updatedStats = response.data?.stats;
      if (updatedStats) {
        setEdited(prev => ({
          ...prev,
          resources: {
            ...prev.resources,
            ...(updatedStats.resources?.sanityMax !== undefined && {
              sanityMax: updatedStats.resources.sanityMax,
              sanity: updatedStats.resources.sanity,
            }),
          },
          combat: {
            ...prev.combat,
            ...(updatedStats.combat?.damageBonus !== undefined && { damageBonus: updatedStats.combat.damageBonus }),
            ...(updatedStats.combat?.build !== undefined && { build: updatedStats.combat.build }),
          },
        }));
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      if (onCharacterUpdate) onCharacterUpdate(payload);
    } catch (err) {
      console.error('Error saving CoC character:', err);
    } finally {
      setIsSaving(false);
    }
  }, [character.id, getCharacterSaveUrl, onCharacterUpdate]);

  const handleSave = useCallback(() => {
    saveCharacter({ ...character, name: charName, avatar: charAvatar, stats: edited });
  }, [character, charName, charAvatar, edited, saveCharacter]);

  const scheduleAutoSave = useCallback(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      setEdited(prev => {
        saveCharacter({ ...character, name: charNameRef.current, avatar: charAvatarRef.current, stats: prev });
        return prev;
      });
    }, 1000);
  }, [character, saveCharacter]);

  const handleNameChange = useCallback((value) => {
    setCharName(value);
    charNameRef.current = value;
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  const handleAvatarChange = useCallback((url) => {
    setCharAvatar(url);
    charAvatarRef.current = url;
    saveCharacter({ ...character, name: charNameRef.current, avatar: url, stats: edited });
  }, [character, edited, saveCharacter]);

  const setGroup = useCallback((group, field, value) => {
    setEdited(prev => ({ ...prev, [group]: { ...prev[group], [field]: value } }));
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  const setSkill = useCallback((skillKey, value) => {
    if (skillKey.startsWith('custom_')) {
      setEdited(prev => ({
        ...prev,
        customSkills: prev.customSkills.map(cs =>
          cs.key === skillKey ? { ...cs, value: parseInt(value) || 0 } : cs
        ),
      }));
    } else {
      setEdited(prev => ({
        ...prev,
        skills: { ...prev.skills, [skillKey]: parseInt(value) || 0 },
      }));
    }
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  const handleToggleSkillFlag = useCallback((skillKey, field) => {
    setEdited(prev => {
      const current = prev[field] || [];
      const updated = current.includes(skillKey)
        ? current.filter(k => k !== skillKey)
        : [...current, skillKey];
      const newStats = { ...prev, [field]: updated };
      const payload = { ...character, stats: newStats };
      axiosInstance.put(getCharacterSaveUrl(character.id), payload).catch(console.error);
      if (onCharacterUpdate) onCharacterUpdate(payload);
      return newStats;
    });
  }, [character, getCharacterSaveUrl, onCharacterUpdate]);

  const addCustomSkill = useCallback((key) => {
    setEdited(prev => ({
      ...prev,
      customSkills: [...(prev.customSkills || []), { key, name: '', base: 0, value: 0 }]
    }));
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  const removeCustomSkill = useCallback((key) => {
    setEdited(prev => ({
      ...prev,
      customSkills: (prev.customSkills || []).filter(cs => cs.key !== key),
    }));
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  const updateCustomSkillName = useCallback((key, name) => {
    setEdited(prev => ({
      ...prev,
      customSkills: (prev.customSkills || []).map(cs => cs.key === key ? { ...cs, name } : cs)
    }));
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  const updateCustomSkillBase = useCallback((key, base) => {
    setEdited(prev => ({
      ...prev,
      customSkills: (prev.customSkills || []).map(cs => cs.key === key ? { ...cs, base: parseInt(base) || 0 } : cs)
    }));
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  const handleToggleWeaponFavourite = useCallback((index) => {
    setEdited(prev => {
      const weps = [...(prev.weapons || [])];
      weps[index] = { ...weps[index], isFavourite: !weps[index].isFavourite };
      const newStats = { ...prev, weapons: weps };
      const payload = { ...character, name: charNameRef.current, avatar: charAvatarRef.current, stats: newStats };
      axiosInstance.put(getCharacterSaveUrl(character.id), payload).catch(console.error);
      if (onCharacterUpdate) onCharacterUpdate(payload);
      return newStats;
    });
  }, [character, getCharacterSaveUrl, onCharacterUpdate]);

  const handleWeaponFieldChange = useCallback((index, field, value) => {
    setEdited(prev => {
      const weps = [...(prev.weapons || [])];
      weps[index] = { ...weps[index], [field]: value };
      return { ...prev, weapons: weps };
    });
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  const handleRemoveWeapon = useCallback((index) => {
    setEdited(prev => ({ ...prev, weapons: prev.weapons.filter((_, wi) => wi !== index) }));
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  const handleAddWeapon = useCallback(() => {
    setEdited(prev => ({
      ...prev,
      weapons: [...(prev.weapons || []), { name: '', damage: '', range: '', attacks: '', ammo: '', malfunction: '', skillKey: 'fighting_brawl' }]
    }));
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  const rollAttr = useCallback(async (attrKey, diceMod = 0) => {
    if (!gameId || !token) return;
    try {
      await fetch(`${getApiUrl()}/games/${gameId}/rollSkill`, {
        method: 'POST',
        headers: getApiHeaders({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }),
        body: JSON.stringify({ skill: `attr_${attrKey}`, modifier: 0, diceMod, characterId: character.id, visibility: rollVisibility })
      });
    } catch (err) {
      console.error('Roll error:', err);
    }
  }, [gameId, token, character.id, rollVisibility]);

  const rollSkill = useCallback(async (skillKey, diceMod = 0) => {
    if (!gameId || !token) return;
    try {
      await fetch(`${getApiUrl()}/games/${gameId}/rollSkill`, {
        method: 'POST',
        headers: getApiHeaders({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }),
        body: JSON.stringify({ skill: skillKey, modifier: 0, diceMod, characterId: character.id, visibility: rollVisibility })
      });
    } catch (err) {
      console.error('Roll error:', err);
    }
  }, [gameId, token, character.id, rollVisibility]);

  const rollWeapon = useCallback(async (weapon, diceMod = 0) => {
    if (!gameId || !token) return;
    try {
      await fetch(`${getApiUrl()}/games/${gameId}/rollWeapon`, {
        method: 'POST',
        headers: getApiHeaders({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }),
        body: JSON.stringify({
          weaponName: weapon.name,
          weaponSkill: weapon.skillKey,
          damage: weapon.damage,
          modifier: 0,
          diceMod,
          characterId: character.id,
          visibility: rollVisibility
        })
      });
    } catch (err) {
      console.error('Weapon roll error:', err);
    }
  }, [gameId, token, character.id, rollVisibility]);

  const handlePopOut = usePopOut(character.id, gameId);
  const headerButtons = useCharacterSheetHeaderButtons({ isSaving, saveSuccess, onSave: handleSave, onPopOut: handlePopOut, isStandalone, t });

  const sheetContent = (
    <div className="coc-sheet-layout">
      <div className="coc-top-row">
        <div className="coc-col-info">
          <CharacterInfoSection
            charName={charName}
            charAvatar={charAvatar}
            edited={edited.basicInfo}
            onNameChange={handleNameChange}
            onAvatarChange={handleAvatarChange}
            onFieldChange={(k, v) => setGroup('basicInfo', k, v)}
          />
          <ResourcesSection
            edited={edited.resources}
            combat={edited.combat}
            onFieldChange={(k, v) => setGroup('resources', k, v)}
            onRollAttr={rollAttr}
            gameId={gameId}
          />
        </div>
        <div className="coc-col-attrs">
          <AttributesSection
            edited={edited.attributes}
            onFieldChange={(k, v) => setGroup('attributes', k, v)}
            onRollAttr={rollAttr}
            gameId={gameId}
          />
        </div>
      </div>

      <SkillsSection
        edited={edited}
        onSetSkill={setSkill}
        onToggleSkillFlag={handleToggleSkillFlag}
        onAddCustomSkill={addCustomSkill}
        onRemoveCustomSkill={removeCustomSkill}
        onUpdateCustomSkillName={updateCustomSkillName}
        onUpdateCustomSkillBase={updateCustomSkillBase}
        onRollSkill={rollSkill}
        gameId={gameId}
      />

      <WeaponsSection
        weapons={edited.weapons || []}
        customSkills={edited.customSkills || []}
        onWeaponFieldChange={handleWeaponFieldChange}
        onRemoveWeapon={handleRemoveWeapon}
        onAddWeapon={handleAddWeapon}
        onToggleFavourite={handleToggleWeaponFavourite}
        onRollWeapon={rollWeapon}
        gameId={gameId}
      />

      <EquipmentSection
        equipment={edited.equipment}
        finances={edited.finances}
        onEquipmentChange={(v) => { setEdited(prev => ({ ...prev, equipment: v })); scheduleAutoSave(); }}
        onFinancesChange={(k, v) => setGroup('finances', k, v)}
      />
      <BackgroundSection
        edited={edited.background}
        onFieldChange={(k, v) => setGroup('background', k, v)}
      />
    </div>
  );

  if (isStandalone) {
    return (
      <div className="sheet-standalone character-sheet-popup">
        <div className="sheet-standalone__content">
          {sheetContent}
        </div>
      </div>
    );
  }

  return (
    <DraggablePopup
      title={`${character.name || '?'}`}
      onClose={onClose}
      headerButtons={headerButtons}
      initialWidth={900}
    >
      {sheetContent}
    </DraggablePopup>
  );
}

export default CoCCharacterSheet;
