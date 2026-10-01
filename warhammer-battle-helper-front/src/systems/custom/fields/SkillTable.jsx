import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { skillGridTemplate, buildSkillRows, splitHalf } from '../skillLayout';
import { genId } from '../../../utils/surrogateKeys';
import SkillTableHeader from './SkillTableHeader';
import SkillTableRow from './SkillTableRow';

// The skill_table field: a header bar plus one row per skill, optionally split into two columns.
//
// `showStar` / `showRoll` / `showActions` arrive as booleans separate from renderStar / renderRoll:
// each reserves a grid track, and the rule for reserving one ("a live handler OR the creator's
// showAffordances") is the sheet's affordance policy. A table that inferred the reservation from
// whether a render prop returned something would hand the creator a different row width than the
// game — the bug FEATURE-212 was about. showActions is the same story for the player's own
// edit/delete buttons, which is why it is not derived from field.playerCanAddSkills here.
//
// `editingPath` is a prop rather than local state because skill_tree edits through the same
// value: two independent states would let a table row and a tree node be edited at once.
function SkillTable({
  field,
  skills,
  attrs,
  attrByKey,
  customSkillNodes,
  developmentSkills,
  onToggleDevelopment,
  onChange,
  readOnly,
  onAddCustomSkill,
  onRemoveCustomSkill,
  onUpdateCustomSkill,
  editingPath,
  setEditingPath,
  showTooltip,
  hideTooltip,
  showStar,
  showRoll,
  showActions,
  renderStar,
  renderRoll,
}) {
  const { t } = useTranslation();

  // Rows the player has just created and not yet named. Kept as state rather than derived from an
  // empty label, because a player may deliberately blank a name mid-edit and the row must not jump
  // to the bottom of a sorted list while they type.
  const [newSkillRows, setNewSkillRows] = useState(() => new Set());

  // Label a row had when its rename began, keyed by row key. A rename writes through on every
  // keystroke, so a sorted list would resort the row letter by letter and crawl it away from the
  // cursor; ordering by this frozen label holds the row still until the rename is confirmed. A ref,
  // not state: it is read while rendering the very update that already re-rendered for the click
  // that set it, and it must never trigger a render of its own.
  const renameSortLabels = useRef({});

  const hasAdv   = !!field.hasAdvances;
  const showDev  = !!field.showDevelopment;
  const advLabel = field.advancesLabel || t('customSheet.advances');

  const gridTemplate = skillGridTemplate({
    showDevelopment: showDev,
    hasAdvances: hasAdv,
    showStar,
    showRoll,
    showActions,
  });
  const rows = buildSkillRows(field, customSkillNodes, newSkillRows, renameSortLabels.current);

  const addSkillRow = () => {
    const key = `${field.key}.${genId('skill')}`;
    setNewSkillRows(prev => new Set(prev).add(key));
    setEditingPath(key);
    onAddCustomSkill(key, { label: '' });
  };

  // A row entered through the pencil keeps its place in a sorted list by being ordered on the label
  // it had at this moment. A row entered through the add button needs no freeze: it is still in
  // newSkillRows, which pins it to the bottom until the name is confirmed.
  const startSkillRename = (key, label) => {
    renameSortLabels.current = { ...renameSortLabels.current, [key]: label };
    setEditingPath(key);
  };

  const finishSkillRow = (key) => {
    const { [key]: _frozen, ...rest } = renameSortLabels.current;
    renameSortLabels.current = rest;
    setNewSkillRows(prev => { const next = new Set(prev); next.delete(key); return next; });
    setEditingPath(null);
  };

  const removeSkillRow = (key) => {
    finishSkillRow(key);
    onRemoveCustomSkill(key);
  };

  const header = (
    <SkillTableHeader
      gridTemplate={gridTemplate}
      showDevelopment={showDev}
      hasAdvances={hasAdv}
      advancesLabel={advLabel}
      showTooltip={showTooltip}
      hideTooltip={hideTooltip}
    />
  );

  const renderRow = (row) => (
    <SkillTableRow
      key={row.key}
      row={row}
      field={field}
      gridTemplate={gridTemplate}
      showDevelopment={showDev}
      hasAdvances={hasAdv}
      showStar={showStar}
      showRoll={showRoll}
      showActions={showActions}
      skills={skills}
      attrs={attrs}
      attrByKey={attrByKey}
      customSkillNodes={customSkillNodes}
      developmentSkills={developmentSkills}
      onToggleDevelopment={onToggleDevelopment}
      onChange={onChange}
      readOnly={readOnly}
      editing={row.custom && editingPath === row.key}
      onStartRename={startSkillRename}
      onFinishRow={finishSkillRow}
      onRemoveRow={onRemoveCustomSkill ? removeSkillRow : null}
      onUpdateCustomSkill={onUpdateCustomSkill}
      renderStar={renderStar}
      renderRoll={renderRoll}
      showTooltip={showTooltip}
      hideTooltip={hideTooltip}
    />
  );

  const columns = field.twoColumns ? splitHalf(rows) : null;

  return (
    <div className="custom-sheet__field custom-sheet__field--skill-table">
      <div className="custom-sheet__section-title">{field.label}</div>
      {columns ? (
        <div className="custom-sheet__skill-table custom-sheet__skill-table--two-col">
          {columns.map((colRows, i) => (
            <div key={i} className="custom-sheet__skill-col">
              {header}
              {colRows.map(renderRow)}
            </div>
          ))}
        </div>
      ) : (
        <div className="custom-sheet__skill-table">
          {header}
          {rows.map(renderRow)}
        </div>
      )}
      {showActions && (
        <button
          className="custom-sheet__skill-add-btn"
          onClick={onAddCustomSkill ? addSkillRow : undefined}
          disabled={!onAddCustomSkill}
        >
          + {t('customSheet.addSkill')}
        </button>
      )}
    </div>
  );
}

export default SkillTable;
