import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import CasinoIcon from '@mui/icons-material/Casino';
import StarIcon from '@mui/icons-material/Star';
import CharacterHeader from '../shared/CharacterHeader';
import { getApiUrl, getApiHeaders } from '../../api/axios';
import { getCharacterSaveUrl } from '../shared/characterApi';
import { weaponRowLabel, weaponDamageIncomplete } from './CustomSheetBody';
import RollModifierOverlay from './RollModifierOverlay';
import { useRollPrompt } from './useRollPrompt';

// Typy pól, które mają sens jako pojedynczy kafelek na skróconej karcie. skill_table i skill_tree
// to kolekcje — trafiają na kartę wyłącznie przez gwiazdki (stats.favoriteSkills).
const SHORT_CARD_TYPES = ['attr', 'number', 'progress'];

function CustomCharacterDetails({
  character,
  onCharacterUpdate,
  addLogMessage,
  gameId = null,
  token = null,
  isGM = false,
  onOpenCharacterSheet = null,
  rollVisibility = 'all',
  game = null,
}) {
  const { t } = useTranslation();

  const template   = game?.customSystemTemplate;
  const stats      = useMemo(() => character?.stats || {}, [character?.stats]);
  const attributes = stats.attributes || {};
  const progress   = stats.progress   || {};
  const numbers    = stats.numbers    || {};

  const handleRoll = useCallback(async (skillKey, mod = 0) => {
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
  }, [gameId, character, token, rollVisibility, addLogMessage, t]);

  const handleRollWeapon = useCallback(async (fieldKey, rowId, mod = 0) => {
    if (!gameId || !character) return;
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

  const renderProgress = (field) => {
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
  };

  const renderTile = (field) => {
    // Backend zawsze wylicza current = base + advances, więc gdy klucz jest obecny w
    // stats.attributes, current jest zawsze ustawione.
    const value = field.type === 'number'
      ? (numbers[field.key] ?? 0)
      : (attributes[field.key]?.current ?? 0);
    return (
      <div key={field.key} className="custom-character-details__attr">
        <span className="custom-character-details__attr-abbr">
          {field.abbr || field.label}
        </span>
        <span className="custom-character-details__attr-val">{value}</span>
        {field.rollable && (
          <button
            className="custom-character-details__roll-btn"
            onClick={() => promptRoll({ skillKey: field.key, label: field.label })}
            disabled={!gameId}
            title={t('combat.roll')}
            aria-label={t('combat.roll')}
          >
            <CasinoIcon style={{ fontSize: 14 }} />
          </button>
        )}
      </div>
    );
  };

  // O zawartości skróconej karty decyduje wyłącznie flaga showOnShortCard z kreatora (BUG-176).
  // Sekcje bez ani jednego zaznaczonego pola odpadają, żeby nie zostawić pustej grupy z separatorem.
  const shortCardSections = useMemo(() => (template?.sections || [])
    .map(s => ({
      id: s.id,
      fields: (s.fields || []).filter(f => f.showOnShortCard && SHORT_CARD_TYPES.includes(f.type)),
    }))
    .filter(s => s.fields.length > 0), [template]);

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
          const opt = (f.skills || []).find(o => o.id === suffix);
          if (opt) return { skillKey: key, label: opt.label, value: allSkills[key]?.current ?? allSkills[key]?.base ?? 0 };
        }
        if (f.type === 'skill_tree') {
          // Ścieżki węzłów zaczynają się od f.key — korzeń drzewa jest kontenerem i nigdy
          // nie jest umiejętnością, więc przeszukujemy wyłącznie jego dzieci (FEATURE-160).
          const found = findNodeLabel(f.tree?.children || [], key, f.key);
          if (found) return { skillKey: key, label: found, value: allSkills[key]?.current ?? allSkills[key]?.base ?? 0 };
        }
      }
      // 3. Klucz bez definicji w szablonie ani w customSkillNodes to sierota — wartość zapisana
      // pod kluczem, którego już (albo nigdy) nie da się rozwiązać do rzutu. Nie zgadujemy nazwy
      // z klucza: dałoby to nierzucalny przycisk podpisany "Node 1786908597489 832657".
      return null;
    }).filter(Boolean);
  }, [stats, template]);

  // Favourite weapons are stored as a flat list of weapon ids covering both player-added rows
  // (in stats.weapons) and GM presets (in the template). We resolve each id to its owning
  // weapons_table field so a roll can carry the {fieldKey, rowId} the backend expects.
  const favoriteWeaponsData = useMemo(() => {
    const favSet = new Set(stats.favoriteWeapons || []);
    if (!favSet.size) return [];
    const playerWeapons = stats.weapons || {};
    const fields = template?.sections?.flatMap(s => s.fields || []) || [];
    const out = [];
    for (const f of fields) {
      if (f.type !== 'weapons_table') continue;
      const dmgBlocks = f.damageFormula || [];
      const collect = (row) => {
        if (!favSet.has(row.id)) return;
        out.push({
          fieldKey: f.key,
          rowId: row.id,
          label: weaponRowLabel(f, row, t),
          incomplete: dmgBlocks.length > 0 && weaponDamageIncomplete(dmgBlocks, row),
        });
      };
      (playerWeapons[f.key] || []).forEach(collect);
      (f.presetWeapons || []).forEach(collect);
    }
    return out;
  }, [stats, template, t]);

  return (
    <div className="character-details custom-character-details">
      <CharacterHeader
        avatarSrc={character?.avatar}
        characterId={character?.id}
        name={character?.name}
        onOpenSheet={() => onOpenCharacterSheet?.(character.id)}
        t={t}
      />

      {/* Pola zaznaczone w kreatorze, pogrupowane po sekcjach szablonu (BUG-176) */}
      {shortCardSections.map(section => (
        <div key={section.id} className="custom-character-details__section">
          {section.fields.map(field => (
            field.type === 'progress' ? renderProgress(field) : renderTile(field)
          ))}
        </div>
      ))}

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
              onClick={() => promptRoll({ skillKey: s.skillKey, label: s.label })}
              disabled={!gameId}
            >
              <span className="custom-character-details__favorite-label">{s.label}</span>
              <span className="custom-character-details__favorite-value">{s.value}</span>
            </button>
          ))}
        </div>
      )}

      {/* Favourite weapons */}
      {favoriteWeaponsData.length > 0 && (
        <div className="custom-character-details__favorites">
          <div className="custom-character-details__favorites-label">
            <StarIcon style={{ fontSize: 11, verticalAlign: 'middle', marginRight: 4 }} />
            {t('character.favoriteWeapons')}
          </div>
          {favoriteWeaponsData.map(w => (
            <button
              key={`${w.fieldKey}.${w.rowId}`}
              className="custom-character-details__favorite-item"
              onClick={() => promptRoll({ weaponFieldKey: w.fieldKey, weaponRowId: w.rowId, label: w.label })}
              disabled={!gameId || w.incomplete}
              title={w.incomplete ? t('customSheet.weaponDamageIncomplete') : undefined}
            >
              <span className="custom-character-details__favorite-label">{w.label}</span>
              <CasinoIcon style={{ fontSize: 14 }} />
            </button>
          ))}
        </div>
      )}

      {/* Pytanie o modyfikator — renderuje się tylko wtedy, gdy szablon go włącza. */}
      {pending && modifierConfig && (
        <RollModifierOverlay
          label={pending.label}
          config={modifierConfig}
          onConfirm={confirmRoll}
          onCancel={cancelRoll}
        />
      )}

    </div>
  );
}

export default CustomCharacterDetails;
