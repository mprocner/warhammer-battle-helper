import React from 'react';
import { useTranslation } from 'react-i18next';
import StarIcon from '@mui/icons-material/Star';
import { AFFORDANCE_ICON_SIZE } from './affordances';
import {
  renderDamageFormula, weaponRowLabel, weaponRowIssue, weaponIssueTitle, weaponSkillColumn,
} from '../weaponLayout';
import { collectSkillOptions } from '../skillLayout';
import RowTable from './RowTable';
import { sortColumnKey } from '../rowTableLayout';

// The weapons_table field: the row-table core plus the three things only a weapon has — the
// favourites star before the GM's columns, and the damage formula and the die after them.
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

  const dmgBlocks = field.damageFormula || [];
  const skillOptions = weaponSkillColumn(field)
    ? collectSkillOptions(sections, customSkillNodes)
    : [];

  // The star is the weapons table's own, not starAffordance's: favourites here are toggled
  // through onChange.weaponFavorite by row id, while the skill fields' helper calls
  // onToggleFavorite with a skill key. What it borrows is the rule that matters — render a dead
  // copy when there is no handler, so the creator reserves the same width the game fills.
  const renderStar = (row) => {
    const active = favoriteWeapons.includes(row.id);
    if (onToggleFavorite) {
      return (
        <button
          className={`custom-sheet__star-btn${active ? ' custom-sheet__star-btn--active' : ''}`}
          onClick={() => onChange && onChange.weaponFavorite(row.id)}
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

  // Damage is read-only on a GM row and on a player row at rest: its number inputs are part of the
  // weapon's definition, not of play.
  const renderDamage = (row, { isPreset, editing }) => (
    <div className="custom-sheet__weapon-damage">
      {renderDamageFormula(dmgBlocks, row, field.key, isPreset ? null : onChange, isPreset || !editing, t)}
    </div>
  );

  const renderRoll = (row) => {
    const issue = weaponRowIssue(field, row);
    return rollAffordance(
      () => !issue && onRoll({ weaponFieldKey: field.key, weaponRowId: row.id, label: weaponRowLabel(field, row, t) }),
      { disabled: !!issue, title: weaponIssueTitle(issue, t) },
    );
  };

  const leading = showStar ? [{ key: 'star', track: '22px', header: null, render: renderStar }] : [];
  const trailing = [
    dmgBlocks.length > 0 && { key: 'damage', track: 'minmax(0, 1fr)', header: t('customSheet.damage'), render: renderDamage },
    showRoll && { key: 'roll', track: '28px', header: null, render: renderRoll },
  ].filter(Boolean);

  return (
    <div className="custom-sheet__field custom-sheet__field--weapon-table">
      <div className="custom-sheet__section-title">{field.label}</div>
      <RowTable
        columns={field.columns || []}
        presets={field.presetWeapons || []}
        rows={weapons[field.key] || []}
        skillOptions={skillOptions}
        leading={leading}
        trailing={trailing}
        labels={{
          add:         t('customSheet.addWeapon'),
          addFromList: t('customSheet.addWeaponFromList'),
          edit:        t('customSheet.editWeapon'),
          save:        t('customSheet.saveWeapon'),
          remove:      t('customSheet.removeWeapon'),
          locked:      t('customSheet.weaponPresetLocked'),
          rowFallback: field.label || t('customSheet.weapon'),
          removeConfirm: name => t('customSheet.removeWeaponConfirm', { name }),
        }}
        onAdd={onChange ? () => onChange.weaponAdd(field.key) : null}
        onAddFromPreset={onChange ? preset => onChange.weaponAddFromPreset(field.key, preset) : null}
        onCell={onChange ? (rowId, colKey, val) => onChange.weaponCell(field.key, rowId, colKey, val) : null}
        onRemove={onChange ? rowId => onChange.weaponRemove(field.key, rowId) : null}
        twoColumns={!!field.twoColumns}
        sortKey={sortColumnKey(field)}
        editingPath={editingPath}
        setEditingPath={setEditingPath}
        showTooltip={showTooltip}
        hideTooltip={hideTooltip}
      />
    </div>
  );
}

export default WeaponsTable;
