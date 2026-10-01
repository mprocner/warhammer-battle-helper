import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  siblingItems, sortItems, subtreeSize, splitBranchesWeighted,
  flattenTree, treeGridTemplate,
} from '../skillLayout';
import { genId } from '../../../utils/surrogateKeys';
import SkillFieldHeader from './SkillFieldHeader';
import SkillTreeRow from './SkillTreeRow';

// The skill_tree field: a header bar plus one row per visible node, optionally split into two
// columns of whole branches.
//
// `showStar` / `showRoll` / `showActions` arrive as booleans separate from renderStar / renderRoll:
// each reserves a grid track, and the rule for reserving one ("a live handler OR the creator's
// showAffordances") is the sheet's affordance policy. A tree that inferred the reservation from
// whether a render prop returned something would hand the creator a different row width than the
// game — the bug FEATURE-212 was about.
//
// `editingPath` is a prop rather than local state because skill_table edits through the same value:
// two independent states would let a table row and a tree node be edited at once.
function SkillTree({
  field,
  skills,
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

  // Only the exceptions are stored: a branch nobody has touched is open.
  const [expanded,        setExpanded]        = useState({});
  const [addingUnderPath, setAddingUnderPath] = useState(null);
  const [addingLabel,     setAddingLabel]     = useState('');
  const [addingAttr,      setAddingAttr]      = useState('');
  // A rename is buffered rather than written through on every keystroke, unlike the table's:
  // a tree rename is confirmed with ✓ or Enter and can be abandoned with ✕.
  const [editingLabel,    setEditingLabel]    = useState('');
  const [editingAttr,     setEditingAttr]     = useState('');

  const showDev    = !!field.showDevelopment;
  const attrFields = Object.values(attrByKey);

  const gridTemplate = treeGridTemplate({
    showDevelopment: showDev,
    showStar,
    showRoll,
    showActions,
  });

  // The tree root is a container, not a skill: the creator only edits tree.children, so the root
  // has no GM-given name and its key belongs in no skill path. Rendering it as a row would store a
  // value under the bare root key with no field.key prefix — an orphan the backend cannot resolve
  // to a roll (FEATURE-160).
  const rootItems = sortItems(
    siblingItems(field.key, field.tree?.children || [], customSkillNodes),
    !!field.sortAlphabetically,
  );

  // Branch order is never touched — only where the single cut falls. The weight counts every node
  // in a branch regardless of whether it is currently expanded: weighing only visible rows would
  // throw branches between columns under the player's fingers each time they collapsed something.
  // A stable layout beats a perfectly even one.
  const branchWeight = (item) => item.node
    ? subtreeSize(item.node, `${field.key}.${item.node.key}`, customSkillNodes)
    : subtreeSize({ key: item.customKey }, item.customKey, customSkillNodes);
  const columns = field.twoColumns ? splitBranchesWeighted(rootItems, branchWeight) : null;

  const flattenOpts = {
    expanded,
    sort: !!field.sortAlphabetically,
    addingUnderPath,
  };

  const toggleExpand = (key) => setExpanded(prev => ({ ...prev, [key]: prev[key] === false }));

  const openAddForm = (parentPath) => {
    setAddingUnderPath(parentPath);
    setAddingLabel('');
    setAddingAttr('');
  };

  const confirmAdd = (parentPath) => {
    const trimmed = addingLabel.trim();
    if (!trimmed) return;
    onAddCustomSkill(`${parentPath}.${genId('skill')}`, {
      label: trimmed,
      ...(addingAttr ? { linkedAttr: addingAttr } : {}),
    });
    setAddingLabel('');
    setAddingAttr('');
    setAddingUnderPath(null);
  };

  const cancelAdd = () => { setAddingLabel(''); setAddingAttr(''); setAddingUnderPath(null); };

  const startEdit = (key) => {
    const node = customSkillNodes[key] || {};
    setEditingPath(key);
    setEditingLabel(node.label || '');
    setEditingAttr(node.linkedAttr || '');
  };

  const confirmEdit = (key) => {
    const trimmed = editingLabel.trim();
    if (trimmed && onUpdateCustomSkill) {
      onUpdateCustomSkill(key, {
        ...customSkillNodes[key],
        label: trimmed,
        ...(editingAttr ? { linkedAttr: editingAttr } : { linkedAttr: undefined }),
      });
    }
    setEditingPath(null);
    setEditingLabel('');
    setEditingAttr('');
  };

  const cancelEdit = () => { setEditingPath(null); setEditingLabel(''); setEditingAttr(''); };

  const renderAddForm = (parentPath, depth) => (
    <div
      key={`${parentPath}::add`}
      className="custom-sheet__skill-tree-add-form"
      style={{ paddingLeft: depth * 16 + 8 }}
    >
      <input
        type="text"
        className="custom-sheet__skill-tree-add-input"
        value={addingLabel}
        autoFocus
        onChange={e => setAddingLabel(e.target.value)}
        placeholder={t('customSheet.skillNamePlaceholder')}
        onKeyDown={e => {
          if (e.key === 'Enter') confirmAdd(parentPath);
          if (e.key === 'Escape') cancelAdd();
        }}
      />
      {field.assignAttrToSkill && (
        <select
          className="custom-sheet__skill-attr-select"
          value={addingAttr}
          onChange={e => setAddingAttr(e.target.value)}
        >
          <option value="">{t('customSheet.attrNone')}</option>
          {attrFields.map(f => <option key={f.key} value={f.key}>{f.abbr || f.label}</option>)}
        </select>
      )}
      <button
        className="custom-sheet__skill-tree-add-confirm"
        onClick={() => confirmAdd(parentPath)}
        disabled={!addingLabel.trim()}
      >✓</button>
      <button className="custom-sheet__skill-tree-add-cancel" onClick={cancelAdd}>✕</button>
    </div>
  );

  const renderRow = (row) => row.kind === 'addForm'
    ? renderAddForm(row.parentPath, row.depth)
    : (
      <SkillTreeRow
        key={row.key}
        row={row}
        field={field}
        gridTemplate={gridTemplate}
        showDevelopment={showDev}
        showStar={showStar}
        showRoll={showRoll}
        showActions={showActions}
        skills={skills}
        attrByKey={attrByKey}
        developmentSkills={developmentSkills}
        onToggleDevelopment={onToggleDevelopment}
        onChange={onChange}
        readOnly={readOnly}
        editing={row.custom && editingPath === row.key}
        editingLabel={editingLabel}
        setEditingLabel={setEditingLabel}
        editingAttr={editingAttr}
        setEditingAttr={setEditingAttr}
        onStartEdit={onUpdateCustomSkill ? startEdit : null}
        onConfirmEdit={confirmEdit}
        onCancelEdit={cancelEdit}
        onToggleExpand={toggleExpand}
        // Hidden while this node's own add form is open — the root-level "+ Add skill" button
        // gates the same way via the addingUnderPath === field.key ternary below. Without this,
        // clicking "+" again while typing calls openAddForm and silently wipes the draft.
        onAddUnder={showActions && onAddCustomSkill && addingUnderPath !== row.key ? (key) => {
          openAddForm(key);
          setExpanded(prev => ({ ...prev, [key]: true }));
        } : null}
        onRemove={onRemoveCustomSkill}
        renderStar={renderStar}
        renderRoll={renderRoll}
        showTooltip={showTooltip}
        hideTooltip={hideTooltip}
      />
    );

  const header = (
    <SkillFieldHeader
      gridTemplate={gridTemplate}
      showDevelopment={showDev}
      hasAdvances={false}
      showTooltip={showTooltip}
      hideTooltip={hideTooltip}
    />
  );

  return (
    <div className="custom-sheet__field custom-sheet__field--skill-tree">
      <div className="custom-sheet__section-title">{field.label}</div>
      <div className={`custom-sheet__skill-tree${columns ? ' custom-sheet__skill-tree--two-col' : ''}`}>
        {columns
          ? columns.map((colItems, i) => (
              <div key={i} className="custom-sheet__skill-col">
                {header}
                {flattenTree(field.key, colItems, customSkillNodes, flattenOpts).map(renderRow)}
              </div>
            ))
          : (
            <>
              {header}
              {flattenTree(field.key, rootItems, customSkillNodes, flattenOpts).map(renderRow)}
            </>
          )}
      </div>
      {/* The add button and its form belong to the field, not to a column: the --two-col modifier
          turns the tree container into a flex row, so a child there would render as a third column
          beside the two branch columns instead of underneath both. The wrapping field div is a
          flex column, so this sibling lands under both for free. */}
      {showActions && onAddCustomSkill && (
        addingUnderPath === field.key
          ? renderAddForm(field.key, 0)
          : <button
              className="custom-sheet__skill-tree-add-btn"
              style={{ paddingLeft: 8 }}
              onClick={() => openAddForm(field.key)}
            >+ {t('customSheet.addSkill')}</button>
      )}
    </div>
  );
}

export default SkillTree;
