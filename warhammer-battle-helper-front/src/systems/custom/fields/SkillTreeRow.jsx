import React from 'react';
import { useTranslation } from 'react-i18next';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { AFFORDANCE_ICON_SIZE } from './affordances';

// One row of a skill_tree, at one depth.
//
// The expand/collapse toggle lives INSIDE the name cell, behind the depth guides, rather than in a
// grid track of its own: its position depends on this row's depth, and a grid track is by
// definition the same for every row. With the toggle pinned to the card's edge a nested parent
// looked as though it expanded from the same place as a root one.
//
// A leaf still reserves the toggle's width (visibility: hidden). Without it two rows at the same
// depth — one with children, one without — would have their names 14px apart, and the indent is
// supposed to mean depth, not "do I happen to have children right now".
//
// The depth band is emitted only for a row that HAS children, which is why the class is chosen
// here and not by a two-class selector in the stylesheet: the rule belongs next to `hasChildren`,
// where a reader can see it. Depth 3 and deeper share depth 2's band — three levels is the real
// case (Melee > One-handed > Sword) and a fourth shade would be a distinction nobody reads.
function SkillTreeRow({
  row,
  field,
  gridTemplate,
  showDevelopment,
  showStar,
  showRoll,
  showActions,
  skills,
  attrByKey,
  developmentSkills,
  onToggleDevelopment,
  onChange,
  readOnly,
  editing,
  editingLabel,
  setEditingLabel,
  editingAttr,
  setEditingAttr,
  onStartEdit,
  onConfirmEdit,
  onCancelEdit,
  onToggleExpand,
  onAddUnder,
  onRemove,
  renderStar,
  renderRoll,
  showTooltip,
  hideTooltip,
}) {
  const { t } = useTranslation();

  // Suffix is gated on the field's own setting, not just on whether this node happens to have an
  // attribute stored: a node keeps its linkedAttr even after the GM turns assignAttrToSkill off,
  // and the suffix must disappear along with the setting.
  const attrInfo = field.assignAttrToSkill && row.attr ? attrByKey[row.attr] : null;
  const displayLabel = attrInfo ? `${row.label} (${attrInfo.abbr || attrInfo.label})` : row.label;
  const attrFields = Object.values(attrByKey);
  const band = row.hasChildren ? ` custom-sheet__skill-tree-row--d${Math.min(row.depth, 2)}` : '';

  return (
    <div className={`custom-sheet__skill-tree-row${band}`} style={{ gridTemplateColumns: gridTemplate }}>
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

      <span className="custom-sheet__skill-tree-namecell">
        {Array.from({ length: row.depth }, (_, i) => (
          <span key={i} className="custom-sheet__skill-tree-guide" aria-hidden="true" />
        ))}
        <button
          className="custom-sheet__skill-tree-toggle"
          style={{ visibility: row.hasChildren ? 'visible' : 'hidden' }}
          onClick={() => row.hasChildren && onToggleExpand(row.key)}
        >
          {row.isOpen ? '▾' : '▸'}
        </button>
        {editing ? (
          <>
            <input
              type="text"
              className="custom-sheet__skill-tree-add-input custom-sheet__skill-tree-edit-input"
              value={editingLabel}
              autoFocus
              onChange={e => setEditingLabel(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') onConfirmEdit(row.key);
                if (e.key === 'Escape') onCancelEdit();
              }}
            />
            {field.assignAttrToSkill && (
              <select
                className="custom-sheet__skill-attr-select"
                value={editingAttr}
                onChange={e => setEditingAttr(e.target.value)}
              >
                <option value="">{t('customSheet.attrNone')}</option>
                {attrFields.map(f => <option key={f.key} value={f.key}>{f.abbr || f.label}</option>)}
              </select>
            )}
          </>
        ) : (
          <span className={`custom-sheet__skill-tree-node-label${row.custom ? ' custom-sheet__skill-tree-node-label--custom' : ''}`}>
            {displayLabel}
          </span>
        )}
      </span>

      <input
        type="number"
        className="custom-sheet__skill-val-input"
        value={skills[row.key]?.base ?? 0}
        onChange={onChange ? e => onChange.skill(row.key, e.target.value) : undefined}
        readOnly={readOnly}
        min={0}
      />

      {showStar && renderStar(row.key)}
      {showRoll && renderRoll(row)}

      {showActions && (
        <span className="custom-sheet__skill-tree-row-actions">
          {editing ? (
            <>
              <button
                className="custom-sheet__skill-tree-add-confirm"
                onClick={() => onConfirmEdit(row.key)}
                disabled={!editingLabel.trim()}
              >✓</button>
              <button className="custom-sheet__skill-tree-add-cancel" onClick={onCancelEdit}>✕</button>
            </>
          ) : (
            <>
              {onAddUnder && (
                <button
                  className="custom-sheet__skill-tree-add-inline"
                  onClick={() => onAddUnder(row.key)}
                  title={t('customSheet.addChildSkill')}
                >+</button>
              )}
              {row.custom && onStartEdit && (
                <button
                  className="custom-sheet__skill-tree-edit"
                  onClick={() => onStartEdit(row.key)}
                  title={t('customSheet.editSkill')}
                >
                  <EditIcon style={{ fontSize: AFFORDANCE_ICON_SIZE }} />
                </button>
              )}
              {row.custom && onRemove && (
                <button
                  className="custom-sheet__skill-tree-del"
                  onClick={() => onRemove(row.key)}
                  title={t('customSheet.removeSkill')}
                >
                  <DeleteIcon style={{ fontSize: AFFORDANCE_ICON_SIZE }} />
                </button>
              )}
            </>
          )}
        </span>
      )}
    </div>
  );
}

export default SkillTreeRow;
