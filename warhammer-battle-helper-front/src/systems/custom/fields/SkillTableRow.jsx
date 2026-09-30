import React from 'react';
import { useTranslation } from 'react-i18next';
import CheckIcon from '@mui/icons-material/Check';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { resolveSkillValues } from '../skillLayout';
import { AFFORDANCE_ICON_SIZE } from './affordances';

// One row of a skill_table.
//
// `showStar` / `showRoll` / `showActions` are booleans separate from renderStar / renderRoll on
// purpose: they reserve a grid track, and the rule for reserving one ("a live handler OR the
// creator's showAffordances") is the parent's affordance policy, not the row's. A row that
// reserved a track based on whether a render prop returned something would give the creator a
// different row width than the game — which is exactly the bug FEATURE-212 was about.
//
// renderRoll receives the ROW, not a ready handler: the row knows which skill it is, the parent
// knows what rolling one means.
//
// editing is passed as explicit state from the parent, never inferred from a blank label —
// otherwise leaving edit mode without typing a name would be impossible, because the
// condition that opened the row would still be true when you try to close it. A row saved
// with a blank name renders as an ordinary row and the pencil re-opens it.
function SkillTableRow({
  row,
  field,
  gridTemplate,
  showDevelopment,
  hasAdvances,
  showStar,
  showRoll,
  showActions,
  skills,
  attrs,
  attrByKey,
  customSkillNodes,
  developmentSkills,
  onToggleDevelopment,
  onChange,
  readOnly,
  editing,
  onStartRename,
  onFinishRow,
  onRemoveRow,
  onUpdateCustomSkill,
  renderStar,
  renderRoll,
  showTooltip,
  hideTooltip,
}) {
  const { t } = useTranslation();

  const attrInfo = row.attr ? attrByKey[row.attr] : null;
  const displayName = attrInfo ? `${row.label} (${attrInfo.abbr || attrInfo.label})` : row.label;
  const { base, advances: adv, total, baseReadOnly } = resolveSkillValues(field, row, skills, attrs);
  const attrFields = Object.values(attrByKey);

  return (
    <div className="custom-sheet__skill-row" style={{ gridTemplateColumns: gridTemplate }}>
      {showDevelopment && (
        <input
          type="checkbox"
          className="custom-sheet__skill-dev-check"
          checked={developmentSkills.includes(row.key)}
          disabled={!onToggleDevelopment}
          onChange={onToggleDevelopment ? () => onToggleDevelopment(row.key) : undefined}
          onMouseEnter={e => showTooltip(t('customSheet.development'), e.currentTarget)}
          onMouseLeave={hideTooltip}
        />
      )}
      {editing ? (
        <span className="custom-sheet__skill-name-edit">
          <input
            type="text"
            className="custom-sheet__skill-name-input"
            value={row.label}
            autoFocus
            placeholder={t('customSheet.skillNamePlaceholder')}
            onChange={e => onUpdateCustomSkill(row.key, {
              ...customSkillNodes[row.key],
              label: e.target.value,
            })}
            onKeyDown={e => { if (e.key === 'Enter') onFinishRow(row.key); }}
          />
          {field.assignAttrToSkill && (
            <select
              className="custom-sheet__skill-attr-select"
              value={row.attr}
              onChange={e => onUpdateCustomSkill(row.key, {
                ...customSkillNodes[row.key],
                linkedAttr: e.target.value || undefined,
              })}
            >
              <option value="">{t('customSheet.attrNone')}</option>
              {attrFields.map(f => <option key={f.key} value={f.key}>{f.abbr || f.label}</option>)}
            </select>
          )}
        </span>
      ) : (
        <span className="custom-sheet__skill-name">{displayName}</span>
      )}
      <input
        type="number"
        className={`custom-sheet__skill-val-input${hasAdvances ? ' custom-sheet__skill-val-input--base' : ''}${baseReadOnly ? ' custom-sheet__skill-val-input--derived' : ''}`}
        value={baseReadOnly ? base : (hasAdvances ? (base || '') : base)}
        onChange={onChange && !baseReadOnly ? e => onChange.skill(row.key, e.target.value) : undefined}
        readOnly={readOnly || baseReadOnly}
        min={0}
      />
      {hasAdvances && (
        <>
          <input
            type="number"
            className="custom-sheet__skill-val-input custom-sheet__skill-val-input--adv"
            value={adv || ''}
            onChange={onChange ? e => onChange.skillAdvances(row.key, e.target.value) : undefined}
            readOnly={readOnly}
          />
          <span className="custom-sheet__skill-val-total">{total}</span>
        </>
      )}
      {showStar && renderStar(row.key)}
      {showRoll && renderRoll(row)}
      {showActions && (
        <span className="custom-sheet__skill-row-actions">
          {row.custom && onUpdateCustomSkill && (editing ? (
            <button className="custom-sheet__skill-save" onClick={() => onFinishRow(row.key)} title={t('customSheet.saveSkill')}>
              <CheckIcon style={{ fontSize: AFFORDANCE_ICON_SIZE }} />
            </button>
          ) : (
            <button className="custom-sheet__skill-edit" onClick={() => onStartRename(row.key, row.label)} title={t('customSheet.editSkill')}>
              <EditIcon style={{ fontSize: AFFORDANCE_ICON_SIZE }} />
            </button>
          ))}
          {row.custom && onRemoveRow && (
            <button className="custom-sheet__skill-del" onClick={() => onRemoveRow(row.key)} title={t('customSheet.removeSkill')}>
              <DeleteIcon style={{ fontSize: AFFORDANCE_ICON_SIZE }} />
            </button>
          )}
        </span>
      )}
    </div>
  );
}

export default SkillTableRow;
