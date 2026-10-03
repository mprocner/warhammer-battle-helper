import React from 'react';
import { useTranslation } from 'react-i18next';
import CloseIcon from '@mui/icons-material/Close';
import CheckIcon from '@mui/icons-material/Check';
import EditIcon from '@mui/icons-material/Edit';
import { AFFORDANCE_ICON_SIZE } from './affordances';
import { renderDamageFormula, weaponRowIssue } from '../weaponLayout';

// One player-owned weapon row, in one of two modes.
//
// At rest it renders the same static cells a GM weapon does. A weapon is set up once and then
// rarely touched, so inputs that are always live spend most of the row's life offering nothing
// but a chance to change it by accident — and the cheapest stray click, delete, is the one that
// cannot be undone. The pencil guards all of it, delete included.
//
// Editing is a visibility gate, not a buffer: a keystroke still writes through onChange.weaponCell
// exactly as before, and the tick only closes the mode. The save itself is already debounced 800ms
// upstream in CharacterSheet's triggerAutoSave, so buffering here would turn one request into one
// request and buy nothing but an undo nobody asked for.
//
// Separate from WeaponsPresetRow rather than one component with a flag: a GM weapon has no edit
// mode to be in, no pencil and no delete, and its cells are muted because they are not the
// player's to change.
function WeaponsTableRow({
  field,
  row,
  cols,
  cellLabel,
  skillOptions,
  nameKey,
  gridTemplate,
  hasDamage,
  showStar,
  showRoll,
  editing,
  onStartEdit,
  onFinishEdit,
  onChange,
  renderStar,
  renderRoll,
  showTooltip,
  hideTooltip,
}) {
  const { t } = useTranslation();
  const issue = weaponRowIssue(field, row);

  // Enter closes the edit the same way the pencil's own tick does — there is no buffer to flush,
  // onFinishEdit only hides the inputs again.
  const finishOnEnter = e => { if (e.key === 'Enter') onFinishEdit(); };

  return (
    <div
      className={`custom-sheet__weapon-row${editing ? '' : ' custom-sheet__weapon-row--reading'}`}
      style={{ gridTemplateColumns: gridTemplate }}
    >
      {showStar && renderStar(row.id)}

      {cols.map((c, i) => {
        const val = (row.cells && row.cells[c.key]) || '';

        if (!editing) {
          const label = cellLabel(c, val) || '—';
          return (
            <span
              key={c.key}
              className={`custom-sheet__weapon-cell-static${c.key === nameKey ? ' custom-sheet__weapon-cell-static--name' : ''}`}
              onMouseEnter={e => {
                const el = e.currentTarget;
                if (el.scrollWidth > el.clientWidth) showTooltip(label, el);
              }}
              onMouseLeave={hideTooltip}
            >
              {label}
            </span>
          );
        }

        // autoFocus only on the first cell: the pencil opens the row straight into it, the same
        // way SkillTableRow's rename input grabs focus the moment it appears.
        const autoFocus = i === 0;

        if (c.type === 'select') {
          const opts = c.optionsFromSkills
            ? skillOptions
            : (c.options || []).map(o => ({ key: o, label: o }));
          return (
            <select
              key={c.key}
              className="custom-sheet__weapon-cell-select"
              value={val}
              onChange={onChange ? e => onChange.weaponCell(field.key, row.id, c.key, e.target.value) : undefined}
              autoFocus={autoFocus}
              onKeyDown={finishOnEnter}
            >
              <option value="">—</option>
              {opts.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          );
        }
        return (
          <input
            key={c.key}
            type={c.type === 'number' ? 'number' : 'text'}
            className="custom-sheet__weapon-cell-input"
            value={val}
            onChange={onChange ? e => onChange.weaponCell(field.key, row.id, c.key, e.target.value) : undefined}
            autoFocus={autoFocus}
            onKeyDown={finishOnEnter}
          />
        );
      })}

      {hasDamage && (
        <div className="custom-sheet__weapon-damage">
          {/* read-only at rest for the same reason the cells are static: the formula's number
              inputs are part of the weapon's definition, not of play. onChange is only ever
              truthy here (the pencil that opens `editing` lives inside an `onChange &&` guard),
              so !editing already means "not editable" without a separate readOnly prop. */}
          {renderDamageFormula(field.damageFormula || [], row, field.key, onChange, !editing, t)}
        </div>
      )}

      {showRoll && renderRoll(row, issue)}

      <div className="custom-sheet__weapon-actions">
        {onChange && (editing ? (
          <>
            <button
              className="custom-sheet__weapon-save"
              onClick={() => onFinishEdit()}
              title={t('customSheet.saveWeapon')}
            >
              <CheckIcon style={{ fontSize: AFFORDANCE_ICON_SIZE }} />
            </button>
            <button
              className="custom-sheet__weapon-remove"
              onClick={() => { onFinishEdit(); onChange.weaponRemove(field.key, row.id); }}
              title={t('customSheet.removeWeapon')}
            >
              <CloseIcon style={{ fontSize: AFFORDANCE_ICON_SIZE }} />
            </button>
          </>
        ) : (
          <button
            className="custom-sheet__weapon-edit"
            onClick={() => onStartEdit(row.id)}
            title={t('customSheet.editWeapon')}
          >
            <EditIcon style={{ fontSize: AFFORDANCE_ICON_SIZE }} />
          </button>
        ))}
      </div>
    </div>
  );
}

export default WeaponsTableRow;
