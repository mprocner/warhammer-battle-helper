import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import CasinoIcon from '@mui/icons-material/Casino';
import StarIcon from '@mui/icons-material/Star';
import CharacterHeader from '../shared/CharacterHeader';
import { getApiUrl, getApiHeaders } from '../../api/axios';
import { getCharacterSaveUrl } from '../shared/characterApi';
import { weaponRowLabel, weaponRowIssue, weaponIssueTitle } from './weaponLayout';
import { walkFields } from '../../utils/templateSections';
import RollModifierOverlay from './RollModifierOverlay';
import { useRollPrompt } from './useRollPrompt';
import { postRoll } from './postRoll';
import { resolveSkillValues } from './skillLayout';
import { computeFieldValue, formulaRefsOf } from './formula/formula';
import { SHORT_CARD_TYPES } from './shortCard';


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
  const formulaRefs = useMemo(() => formulaRefsOf(template?.sections), [template]);

  const handleRoll = useCallback(async (skillKey, mod = 0) => {
    if (!gameId || !character) return;
    await postRoll(gameId, 'rollSkill', token, { skill: skillKey, modifier: mod, characterId: character.id, visibility: rollVisibility },
      () => addLogMessage?.(t('combat.rollFailed'), 'error'));
  }, [gameId, character, token, rollVisibility, addLogMessage, t]);

  const handleRollWeapon = useCallback(async (fieldKey, rowId, mod = 0) => {
    if (!gameId || !character) return;
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

  // A computed tile is evaluated here from the saved stats, the same way the sheet evaluates it
  // from its live values; nothing is stored for it. Null (no value and no default) shows as a dash.
  const tileValue = (field) => {
    if (field.type === 'number') return numbers[field.key] ?? 0;
    if (field.type === 'computed') return computeFieldValue(field, { attributes, numbers }, formulaRefs) ?? '—';
    // Backend zawsze wylicza current = base + advances, więc gdy klucz jest obecny w
    // stats.attributes, current jest zawsze ustawione.
    return attributes[field.key]?.current ?? 0;
  };

  const renderTile = (field) => {
    const value = tileValue(field);
    return (
      <div
        key={field.key}
        className={`custom-character-details__attr${field.type === 'computed' ? ' custom-character-details__attr--computed' : ''}`}
      >
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
  //
  // Grouping is by ROOT section only: the short card is a flat strip of tiles with one block
  // per root section, so a field flagged inside a subsection joins its root section's block
  // rather than starting one of its own. Without the subtree walk it would vanish silently,
  // even though the creator paints the ▤ badge on it and promises the GM it will show.
  const shortCardSections = useMemo(() => (template?.sections || [])
    .map(s => {
      const picked = [];
      walkFields([s], f => {
        if (f.showOnShortCard && SHORT_CARD_TYPES.includes(f.type)) picked.push(f);
      });
      return { id: s.id, fields: picked };
    })
    .filter(s => s.fields.length > 0), [template]);

  const favoriteSkillsData = useMemo(() => {
    const favKeys = stats.favoriteSkills || [];
    if (!favKeys.length) return [];
    const allSkills = stats.skills || {};
    const customNodes = stats.customSkillNodes || {};
    // Every leaf at every depth: a favourited skill inside a subsection must still resolve to
    // its label, or it falls through to the orphan branch and is dropped from the list.
    const fields = [];
    walkFields(template?.sections, f => fields.push(f));

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
      if (customNodes[key]?.label) {
        // A player-added skill lives BEFORE the field loop below, so it has no owning field in
        // scope yet — locate it by key prefix. It may belong to a skill_table (which can derive
        // its base from an attribute) or a skill_tree (which never does); resolveSkillValues
        // falls back to the non-derived composition when the owner is a tree or not found at
        // all, so one call covers both without special-casing the tree here.
        const owner = fields.find(f => key.startsWith(f.key + '.'));
        const values = resolveSkillValues(owner || {}, { key, attr: customNodes[key].linkedAttr }, allSkills, stats.attributes);
        return { skillKey: key, label: customNodes[key].label, value: values.total };
      }
      // 2. Skill table / Skill tree
      for (const f of fields) {
        if (f.type === 'skill_table' && key.startsWith(f.key + '.')) {
          const suffix = key.slice(f.key.length + 1);
          const opt = (f.skills || []).find(o => o.id === suffix);
          // A derived row's persisted stats.skills[key].current is stale: nothing ever writes the
          // linked attribute into it, so it holds 0 + advances. resolveSkillValues composes the
          // real total (attribute + advances) at read time, the same way the sheet and the roll
          // log do — reading `current` here would show the advances alone.
          if (opt) return { skillKey: key, label: opt.label, value: resolveSkillValues(f, { key, attr: opt.attr }, allSkills, stats.attributes).total };
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
    // Depth-first over every leaf: the backend can roll a weapon from a nested weapons_table,
    // so a flat pass here would hide rows the player already favourited.
    const fields = [];
    walkFields(template?.sections, f => fields.push(f));
    const out = [];
    for (const f of fields) {
      if (f.type !== 'weapons_table') continue;
      const collect = (row) => {
        if (!favSet.has(row.id)) return;
        out.push({
          fieldKey: f.key,
          rowId: row.id,
          label: weaponRowLabel(f, row, t),
          issue: weaponRowIssue(f, row),
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
              disabled={!gameId || !!w.issue}
              title={weaponIssueTitle(w.issue, t)}
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
