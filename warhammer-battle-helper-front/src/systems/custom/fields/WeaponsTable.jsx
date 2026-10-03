import React from 'react';
import { useTranslation } from 'react-i18next';
import StarIcon from '@mui/icons-material/Star';
import { AFFORDANCE_ICON_SIZE } from './affordances';
import {
  weaponGridTemplate, weaponRowLabel, weaponIssueTitle, weaponSkillColumn,
} from '../weaponLayout';
import { collectSkillOptions } from '../skillLayout';
import WeaponsPresetRow from './WeaponsPresetRow';
import WeaponsTableRow from './WeaponsTableRow';

// The weapons_table field: a header bar, the GM's always-on weapons, the player's own, and a
// footer that adds either kind.
//
// The columns are the GM's, so their widths come from weaponGridTemplate and the same string goes
// to the header and to every row. Before FEATURE-224 both were flex rows that happened to hold
// the same number of flex: 1 children — an agreement nothing enforced, over a column set the GM
// can change.
//
// The footer is a sibling of the table container, not of the rows: the zebra striping counts
// sibling parity, so a footer inside would be counted as a row and flip the tint of everything
// after it.
//
// editingPath/setEditingPath are the same pair CustomSheetBody hands to SkillTable and SkillTree:
// on the whole sheet exactly one thing is being edited at a time, so opening a weapon's pencil
// closes an open skill rename and vice versa. There is no key collision to guard against — skill
// edit paths carry a dot and the owning field's key prefix (`${field.key}.${genId('skill')}`),
// while weapon row ids come from CharacterSheet's own genWeaponId() ("w_<timestamp>_<rand>") and
// never contain a dot.
function WeaponsTable({
  field,
  sections,
  weapons,
  customSkillNodes,
  favoriteWeapons,
  onChange,
  onRoll,
  onToggleFavorite,
  readOnly,
  showStar,
  showRoll,
  rollAffordance,
  editingPath,
  setEditingPath,
  showTooltip,
  hideTooltip,
}) {
  const { t } = useTranslation();

  const cols      = field.columns || [];
  const rows      = weapons[field.key] || [];
  const dmgBlocks = field.damageFormula || [];
  const hasDamage = dmgBlocks.length > 0;
  const presets   = field.presetWeapons || [];
  const alwaysOnPresets = presets.filter(p => p.alwaysOn);
  const catalogPresets  = presets.filter(p => !p.alwaysOn);

  const skillOptions = weaponSkillColumn(field)
    ? collectSkillOptions(sections, customSkillNodes)
    : [];

  // The name column is the first text column — the same one weaponRowLabel logs a roll under.
  const nameKey = (cols.find(c => c.type === 'text') || {}).key;

  const gridTemplate = weaponGridTemplate(field, {
    showStar,
    showRoll,
    showActions: true,
    hasDamage,
  });

  // Resolves a select cell to its display label (skill name or option label). A key that no
  // longer resolves — a removed skill, a deleted custom node — returns '' rather than the raw
  // surrogate key: those ids are internal and must never reach the screen, so callers' own
  // `|| '—'` is what the player sees instead.
  const cellLabel = (c, val) => {
    if (c.type !== 'select') return val;
    const opts = c.optionsFromSkills
      ? skillOptions
      : (c.options || []).map(o => ({ key: o, label: o }));
    return opts.find(o => o.key === val)?.label || '';
  };

  // The star is the weapons table's own, not starAffordance's: favourites here are toggled
  // through onChange.weaponFavorite by row id, while the skill fields' helper calls
  // onToggleFavorite with a skill key. What it borrows is the rule that matters — render a dead
  // copy when there is no handler, so the creator reserves the same width the game fills.
  const renderStar = (id) => {
    const active = favoriteWeapons.includes(id);
    if (onToggleFavorite) {
      return (
        <button
          className={`custom-sheet__star-btn${active ? ' custom-sheet__star-btn--active' : ''}`}
          onClick={() => onChange && onChange.weaponFavorite(id)}
          disabled={readOnly}
          title={t('customSheet.favorite')}
        >
          <StarIcon style={{ fontSize: AFFORDANCE_ICON_SIZE }} />
        </button>
      );
    }
    return (
      <span className="custom-sheet__star-btn custom-sheet__star-btn--static" aria-hidden="true">
        <StarIcon style={{ fontSize: AFFORDANCE_ICON_SIZE }} />
      </span>
    );
  };

  const renderRoll = (row, issue) => rollAffordance(
    () => !issue && onRoll({ weaponFieldKey: field.key, weaponRowId: row.id, label: weaponRowLabel(field, row, t) }),
    { disabled: !!issue, title: weaponIssueTitle(issue, t) },
  );

  return (
    <div className="custom-sheet__field custom-sheet__field--weapon-table">
      <div className="custom-sheet__section-title">{field.label}</div>
      <div className="custom-sheet__weapon-table">
        <div className="custom-sheet__field-header" style={{ gridTemplateColumns: gridTemplate }}>
          {showStar && <span className="custom-sheet__weapon-col-label" />}
          {cols.map(c => (
            <span key={c.key} className="custom-sheet__weapon-col-label">{c.label}</span>
          ))}
          {hasDamage && <span className="custom-sheet__weapon-col-label">{t('customSheet.damage')}</span>}
          {showRoll && <span className="custom-sheet__weapon-col-label" />}
          <span className="custom-sheet__weapon-col-label" />
        </div>

        {alwaysOnPresets.map(preset => (
          <WeaponsPresetRow
            key={preset.id}
            field={field}
            preset={preset}
            cols={cols}
            cellLabel={cellLabel}
            nameKey={nameKey}
            gridTemplate={gridTemplate}
            hasDamage={hasDamage}
            showStar={showStar}
            showRoll={showRoll}
            renderStar={renderStar}
            renderRoll={renderRoll}
            showTooltip={showTooltip}
            hideTooltip={hideTooltip}
          />
        ))}

        {rows.map(row => (
          <WeaponsTableRow
            key={row.id}
            field={field}
            row={row}
            cols={cols}
            cellLabel={cellLabel}
            skillOptions={skillOptions}
            nameKey={nameKey}
            gridTemplate={gridTemplate}
            hasDamage={hasDamage}
            showStar={showStar}
            showRoll={showRoll}
            editing={editingPath === row.id}
            onStartEdit={setEditingPath}
            onFinishEdit={() => setEditingPath(null)}
            onChange={onChange}
            renderStar={renderStar}
            renderRoll={renderRoll}
            showTooltip={showTooltip}
            hideTooltip={hideTooltip}
          />
        ))}
      </div>

      {onChange && (
        <div className="custom-sheet__weapon-add-row">
          {/* The new row has no values yet — opening it straight into edit mode is what saves the
              player from a line of em-dashes and a hunt for the pencil. A catalogue pick (below)
              arrives pre-filled and reads fine at rest, so it does not get the same treatment. */}
          <button
            className="custom-sheet__weapon-add-btn"
            onClick={() => setEditingPath(onChange.weaponAdd(field.key))}
          >
            + {t('customSheet.addWeapon')}
          </button>
          {catalogPresets.length > 0 && (
            <select
              className="custom-sheet__weapon-preset-picker"
              value=""
              onChange={e => {
                const preset = catalogPresets.find(p => p.id === e.target.value);
                if (preset) onChange.weaponAddFromPreset(field.key, preset);
              }}
            >
              <option value="">+ {t('customSheet.addWeaponFromList')}</option>
              {catalogPresets.map(p => (
                <option key={p.id} value={p.id}>{weaponRowLabel(field, p, t)}</option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  );
}

export default WeaponsTable;
