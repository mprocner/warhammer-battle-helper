import React, { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { usePopOut, useCharacterSheetHeaderButtons } from '../shared/useCharacterSheetActions';
import DraggablePopup from '../../components/common/DraggablePopup';
import axiosInstance from '../../api/axios';
import { getApiUrl, getApiHeaders } from '../../api/axios';
import { getCharacterSaveUrl as getCharacterSaveUrlBase } from '../shared/characterApi';

import CharacterInfoSection    from './sections/CharacterInfoSection';
import AbilityScoresSection    from './sections/AbilityScoresSection';
import CombatStatsSection      from './sections/CombatStatsSection';
import SavingThrowsSection     from './sections/SavingThrowsSection';
import SkillsSection           from './sections/SkillsSection';
import AttacksSection          from './sections/AttacksSection';
import FeaturesSection         from './sections/FeaturesSection';
import SpellSlotsSection       from './sections/SpellSlotsSection';
import SpellsSection           from './sections/SpellsSection';
import NotesSection            from './sections/NotesSection';

function DnD5eCharacterSheet({ character, onClose, onCharacterUpdate, addLogMessage, gameId, token,
  isGM = false, isStandalone = false, rollVisibility = 'all' }) {
  const { t } = useTranslation();
  const s = character.stats || {};

  const initStats = () => ({
    info:             s.info             || { level: 1 },
    abilities:        s.abilities        || { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    savingThrowProfs: s.savingThrowProfs || {},
    skillProfs:       s.skillProfs       || {},
    resources:        s.resources        || { hp: 10, hpMax: 10, tempHp: 0 },
    derived:          s.derived          || {},
    armorClass:       s.armorClass       ?? 10,
    speed:            s.speed            ?? 30,
    hitDie:           s.hitDie           || 'd8',
    isSpellcaster:    s.isSpellcaster    ?? false,
    spellcastingAbility: s.spellcastingAbility || 'int',
    spellSlots:       s.spellSlots       || [],
    weapons:          s.weapons          || [],
    features:         s.features         || [],
    favoriteSkills:   s.favoriteSkills   || [],
    favoriteWeapons:  s.favoriteWeapons  || [],
    equipment:        s.equipment        || '',
    notes:            s.notes            || '',
    spells:           s.spells           || [],
    inspiration:      s.inspiration      ?? false,
  });

  const [edited, setEdited] = useState(initStats);
  const [charName, setCharName] = useState(character.name || '');
  const [charAvatar, setCharAvatar] = useState(character.avatar || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const autoSaveTimer  = useRef(null);
  const charNameRef    = useRef(character.name || '');
  const charAvatarRef  = useRef(character.avatar || '');
  const prevCharIdRef  = useRef(character.id);

  // Full reset only when switching to a different character.
  // For same-character prop updates (own save echo, WS derived update) — only refresh derived.
  React.useEffect(() => {
    const st = character.stats || {};
    const isNewCharacter = character.id !== prevCharIdRef.current;
    prevCharIdRef.current = character.id;

    if (!isNewCharacter) {
      // Keep all local edits — only pull in server-computed derived values
      if (st.derived) setEdited(prev => ({ ...prev, derived: st.derived }));
      return;
    }

    // Switched to a different character — full reset
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = null;
    }
    setEdited({
      info:             st.info             || { level: 1 },
      abilities:        st.abilities        || { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      savingThrowProfs: st.savingThrowProfs || {},
      skillProfs:       st.skillProfs       || {},
      resources:        st.resources        || { hp: 10, hpMax: 10, tempHp: 0 },
      derived:          st.derived          || {},
      armorClass:       st.armorClass       ?? 10,
      speed:            st.speed            ?? 30,
      hitDie:           st.hitDie           || 'd8',
      isSpellcaster:    st.isSpellcaster    ?? false,
      spellcastingAbility: st.spellcastingAbility || 'int',
      spellSlots:       st.spellSlots       || [],
      weapons:          st.weapons          || [],
      features:         st.features         || [],
      favoriteSkills:   st.favoriteSkills   || [],
      favoriteWeapons:  st.favoriteWeapons  || [],
      equipment:        st.equipment        || '',
      notes:            st.notes            || '',
      spells:           st.spells           || [],
      inspiration:      st.inspiration      ?? false,
    });
    setCharName(character.name || '');
    setCharAvatar(character.avatar || '');
    charNameRef.current   = character.name || '';
    charAvatarRef.current = character.avatar || '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character]);

  const getCharacterSaveUrl = useCallback((charId) => getCharacterSaveUrlBase(charId, gameId), [gameId]);

  const saveCharacter = useCallback(async (payload) => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const response = await axiosInstance.put(getCharacterSaveUrl(character.id), payload);
      const updatedStats = response.data?.stats;
      if (updatedStats?.derived) {
        setEdited(prev => ({ ...prev, derived: updatedStats.derived }));
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      if (onCharacterUpdate) onCharacterUpdate(payload);
    } catch (err) {
      console.error('Error saving D&D character:', err);
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

  const saveImmediately = useCallback((newStats) => {
    saveCharacter({ ...character, name: charNameRef.current, avatar: charAvatarRef.current, stats: newStats });
  }, [character, saveCharacter]);

  // ---- Field change helpers ----

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

  const handleInfoChange = useCallback((field, value) => {
    setEdited(prev => ({ ...prev, info: { ...prev.info, [field]: value } }));
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  const handleAbilityChange = useCallback((key, value) => {
    setEdited(prev => ({ ...prev, abilities: { ...prev.abilities, [key]: value } }));
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  const handleResourceChange = useCallback((field, value) => {
    setEdited(prev => ({ ...prev, resources: { ...prev.resources, [field]: value } }));
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  const handleFieldChange = useCallback((field, value) => {
    setEdited(prev => ({ ...prev, [field]: value }));
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  const handleToggleSaveProf = useCallback((key) => {
    setEdited(prev => {
      const newStats = { ...prev, savingThrowProfs: { ...prev.savingThrowProfs, [key]: !prev.savingThrowProfs[key] } };
      saveImmediately(newStats);
      return newStats;
    });
  }, [saveImmediately]);

  const handleToggleSkillProf = useCallback((key, level) => {
    setEdited(prev => {
      const newStats = { ...prev, skillProfs: { ...prev.skillProfs, [key]: level } };
      saveImmediately(newStats);
      return newStats;
    });
  }, [saveImmediately]);

  const handleToggleSkillFavorite = useCallback((key) => {
    setEdited(prev => {
      const favs = prev.favoriteSkills || [];
      const updated = favs.includes(key) ? favs.filter(k => k !== key) : [...favs, key];
      const newStats = { ...prev, favoriteSkills: updated };
      saveImmediately(newStats);
      return newStats;
    });
  }, [saveImmediately]);

  const handleDeathSaveChange = useCallback((field, value) => {
    setEdited(prev => {
      const newStats = { ...prev, resources: { ...prev.resources, [field]: Math.max(0, Math.min(3, value)) } };
      saveImmediately(newStats);
      return newStats;
    });
  }, [saveImmediately]);

  // ---- Weapon handlers ----

  const handleWeaponChange = useCallback((idx, field, value) => {
    setEdited(prev => {
      const weps = [...(prev.weapons || [])];
      weps[idx] = { ...weps[idx], [field]: value };
      return { ...prev, weapons: weps };
    });
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  const handleAddWeapon = useCallback(() => {
    setEdited(prev => ({
      ...prev,
      weapons: [...(prev.weapons || []), { name: '', attackAbility: 'str', damage: '1d6', damageType: 'slashing', proficient: true, range: '5ft', properties: '', isFavourite: false }]
    }));
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  const handleRemoveWeapon = useCallback((idx) => {
    setEdited(prev => ({ ...prev, weapons: (prev.weapons || []).filter((_, i) => i !== idx) }));
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  const handleToggleWeaponFavourite = useCallback((idx) => {
    setEdited(prev => {
      const weps = [...(prev.weapons || [])];
      weps[idx] = { ...weps[idx], isFavourite: !weps[idx].isFavourite };
      const newStats = { ...prev, weapons: weps };
      saveImmediately(newStats);
      return newStats;
    });
  }, [saveImmediately]);

  // ---- Feature handlers ----

  const handleFeatureChange = useCallback((idx, field, value) => {
    setEdited(prev => {
      const feats = [...(prev.features || [])];
      feats[idx] = { ...feats[idx], [field]: value };
      return { ...prev, features: feats };
    });
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  const handleAddFeature = useCallback(() => {
    setEdited(prev => ({
      ...prev,
      features: [...(prev.features || []), { name: '', source: 'Class', description: '' }]
    }));
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  const handleRemoveFeature = useCallback((idx) => {
    setEdited(prev => ({ ...prev, features: (prev.features || []).filter((_, i) => i !== idx) }));
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  // ---- Spell handlers ----

  const handleSpellChange = useCallback((idx, field, value) => {
    setEdited(prev => {
      const spells = [...(prev.spells || [])];
      spells[idx] = { ...spells[idx], [field]: value };
      return { ...prev, spells };
    });
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  const handleAddSpell = useCallback(() => {
    setEdited(prev => {
      const newStats = {
        ...prev,
        spells: [...(prev.spells || []), { name: '', level: 0, prepared: false, concentration: false, ritual: false, isFavourite: false, description: '' }]
      };
      saveImmediately(newStats);
      return newStats;
    });
  }, [saveImmediately]);

  const handleRemoveSpell = useCallback((idx) => {
    setEdited(prev => ({ ...prev, spells: (prev.spells || []).filter((_, i) => i !== idx) }));
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  const handleToggleSpellFavourite = useCallback((idx) => {
    setEdited(prev => {
      const spells = [...(prev.spells || [])];
      spells[idx] = { ...spells[idx], isFavourite: !spells[idx].isFavourite };
      const newStats = { ...prev, spells };
      saveImmediately(newStats);
      return newStats;
    });
  }, [saveImmediately]);

  const handleSaveSpell = useCallback(() => {
    setEdited(prev => {
      saveImmediately(prev);
      return prev;
    });
  }, [saveImmediately]);

  // ---- Spell slot handlers ----

  const handleSpellSlotChange = useCallback((level, field, value) => {
    setEdited(prev => {
      const slots = [...(prev.spellSlots || [])];
      const existing = slots.findIndex(s => s.level === level);
      if (existing >= 0) {
        slots[existing] = { ...slots[existing], [field]: value };
      } else {
        slots.push({ level, total: field === 'total' ? value : 0, used: field === 'used' ? value : 0 });
      }
      return { ...prev, spellSlots: slots };
    });
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  // ---- Roll handlers ----

  const rollAbility = useCallback(async (abilityKey, diceMod = 0) => {
    if (!gameId || !token) return;
    try {
      await fetch(`${getApiUrl()}/games/${gameId}/rollSkill`, {
        method: 'POST',
        headers: getApiHeaders({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }),
        body: JSON.stringify({ skill: `ability_${abilityKey}`, modifier: 0, diceMod, characterId: character.id, visibility: rollVisibility })
      });
    } catch (err) { console.error('Roll error:', err); }
  }, [gameId, token, character.id, rollVisibility]);

  const rollSave = useCallback(async (abilityKey, diceMod = 0) => {
    if (!gameId || !token) return;
    try {
      await fetch(`${getApiUrl()}/games/${gameId}/rollSkill`, {
        method: 'POST',
        headers: getApiHeaders({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }),
        body: JSON.stringify({ skill: `save_${abilityKey}`, modifier: 0, diceMod, characterId: character.id, visibility: rollVisibility })
      });
    } catch (err) { console.error('Roll error:', err); }
  }, [gameId, token, character.id, rollVisibility]);

  const rollSkill = useCallback(async (skillKey, diceMod = 0) => {
    if (!gameId || !token) return;
    try {
      await fetch(`${getApiUrl()}/games/${gameId}/rollSkill`, {
        method: 'POST',
        headers: getApiHeaders({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }),
        body: JSON.stringify({ skill: `skill_${skillKey}`, modifier: 0, diceMod, characterId: character.id, visibility: rollVisibility })
      });
    } catch (err) { console.error('Roll error:', err); }
  }, [gameId, token, character.id, rollVisibility]);

  const rollWeapon = useCallback(async (weapon, diceMod = 0) => {
    if (!gameId || !token) return;
    try {
      await fetch(`${getApiUrl()}/games/${gameId}/rollWeapon`, {
        method: 'POST',
        headers: getApiHeaders({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }),
        body: JSON.stringify({
          weaponName: weapon.name,
          weaponSkill: weapon.attackAbility || 'str',
          damage: weapon.damage,
          modifier: 0,
          diceMod,
          characterId: character.id,
          visibility: rollVisibility
        })
      });
    } catch (err) { console.error('Weapon roll error:', err); }
  }, [gameId, token, character.id, rollVisibility]);

  const handlePopOut = usePopOut(character.id, gameId);
  const headerButtons = useCharacterSheetHeaderButtons({ isSaving, saveSuccess, onSave: handleSave, onPopOut: handlePopOut, isStandalone, t });

  const pb = edited.derived?.proficiencyBonus ?? 2;
  const passivePerc = edited.derived?.passivePerception ?? 10;
  const profBonusStr = pb >= 0 ? `+${pb}` : `${pb}`;

  const sheetContent = (
    <div className="dnd-sheet-layout">

      {/* TOP BAND: character info (left) + 6 ability boxes (right) */}
      <div className="dnd-sheet__top-band">
        <div className="dnd-sheet__top-info">
          <CharacterInfoSection
            charName={charName}
            charAvatar={charAvatar}
            info={edited.info}
            onNameChange={handleNameChange}
            onAvatarChange={handleAvatarChange}
            onInfoChange={handleInfoChange}
          />
        </div>
        <div className="dnd-sheet__top-abilities">
          <AbilityScoresSection
            abilities={edited.abilities}
            onAbilityChange={handleAbilityChange}
            onRollAbility={rollAbility}
            gameId={gameId}
          />
        </div>
      </div>

      {/* BODY: saves+skills (left) | combat+rest (right) */}
      <div className="dnd-sheet__body">

        {/* LEFT: inspiration + saves + skills + passive perc */}
        <div className="dnd-sheet__left">
          <div className="dnd-section">
            <div className="dnd-insp-prof-row">
              <button
                className="dnd-insp-box"
                onClick={() => { setEdited(prev => ({ ...prev, inspiration: !prev.inspiration })); scheduleAutoSave(); }}
                title={t('dnd.inspiration')}
              >
                <div className={`dnd-insp-box__checkbox ${edited.inspiration ? 'dnd-insp-box__checkbox--checked' : ''}`}>
                  {edited.inspiration ? '✓' : ''}
                </div>
                <div className="dnd-insp-box__label">{t('dnd.inspiration')}</div>
              </button>
              <div className="dnd-prof-bonus-box">
                <div className="dnd-prof-bonus-box__value">{profBonusStr}</div>
                <div className="dnd-prof-bonus-box__label">{t('dnd.proficiencyBonus')}</div>
              </div>
            </div>
          </div>

          <SavingThrowsSection
            saveProfs={edited.savingThrowProfs}
            derived={edited.derived}
            onToggleSaveProf={handleToggleSaveProf}
            onRollSave={rollSave}
            gameId={gameId}
          />

          <SkillsSection
            skillProfs={edited.skillProfs}
            favoriteSkills={edited.favoriteSkills}
            derived={edited.derived}
            onToggleSkillProf={handleToggleSkillProf}
            onToggleFavorite={handleToggleSkillFavorite}
            onRollSkill={rollSkill}
            gameId={gameId}
          />

          <div className="dnd-passive-box">
            <span className="dnd-passive-box__label">{t('dnd.passivePerception')}</span>
            <span className="dnd-passive-box__value">{passivePerc}</span>
          </div>
        </div>

        {/* RIGHT: combat + death saves + attacks + spells + features + notes */}
        <div className="dnd-sheet__right">
          <CombatStatsSection
            resources={edited.resources}
            derived={edited.derived}
            armorClass={edited.armorClass}
            speed={edited.speed}
            hitDie={edited.hitDie}
            isSpellcaster={edited.isSpellcaster}
            onResourceChange={handleResourceChange}
            onFieldChange={handleFieldChange}
            deathSaves={edited.resources}
            onDeathSaveChange={handleDeathSaveChange}
          />
          <AttacksSection
            weapons={edited.weapons}
            onWeaponChange={handleWeaponChange}
            onAddWeapon={handleAddWeapon}
            onRemoveWeapon={handleRemoveWeapon}
            onToggleFavourite={handleToggleWeaponFavourite}
            onRollWeapon={rollWeapon}
            gameId={gameId}
          />
          {edited.isSpellcaster && (
            <SpellSlotsSection
              spellSlots={edited.spellSlots}
              spellcastingAbility={edited.spellcastingAbility}
              onSpellSlotChange={handleSpellSlotChange}
              onSpellcastingAbilityChange={(v) => handleFieldChange('spellcastingAbility', v)}
            />
          )}
          {edited.isSpellcaster && (
            <SpellsSection
              spells={edited.spells}
              onSpellChange={handleSpellChange}
              onAddSpell={handleAddSpell}
              onRemoveSpell={handleRemoveSpell}
              onToggleFavourite={handleToggleSpellFavourite}
              onSaveSpell={handleSaveSpell}
            />
          )}
          <div className="dnd-section">
            <label className="dnd-toggle-label">
              <input
                type="checkbox"
                checked={edited.isSpellcaster ?? false}
                onChange={e => { setEdited(prev => ({ ...prev, isSpellcaster: e.target.checked })); scheduleAutoSave(); }}
              />
              {' '}{t('dnd.enableSpellcasting')}
            </label>
          </div>
          <FeaturesSection
            features={edited.features}
            onFeatureChange={handleFeatureChange}
            onAddFeature={handleAddFeature}
            onRemoveFeature={handleRemoveFeature}
          />
          <NotesSection
            notes={edited.notes}
            equipment={edited.equipment}
            onNotesChange={(v) => { setEdited(prev => ({ ...prev, notes: v })); scheduleAutoSave(); }}
            onEquipmentChange={(v) => { setEdited(prev => ({ ...prev, equipment: v })); scheduleAutoSave(); }}
          />
        </div>

      </div>
    </div>
  );

  if (isStandalone) {
    return (
      <div className="sheet-standalone character-sheet-popup">
        <div className="sheet-standalone__content">{sheetContent}</div>
      </div>
    );
  }

  return (
    <DraggablePopup
      title={character.name || '?'}
      onClose={onClose}
      headerButtons={headerButtons}
      initialWidth={1100}
    >
      {sheetContent}
    </DraggablePopup>
  );
}

export default DnD5eCharacterSheet;
