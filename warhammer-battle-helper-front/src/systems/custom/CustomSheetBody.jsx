import React, { useState } from 'react';
import CasinoIcon from '@mui/icons-material/Casino';
import EditIcon from '@mui/icons-material/Edit';

function labelToKey(label) {
  return label
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// onChange = { attr, advances, skill, text, progress } | null (read-only)
// onRoll   = (rollModal) => void | null (no rolls)
function CustomSheetBody({
  sections,
  values = {},
  onChange = null,
  onRoll = null,
  customSkillNodes = {},
  onAddCustomSkill = null,
  onRemoveCustomSkill = null,
  onUpdateCustomSkill = null,
}) {
  const attrs    = values.attributes || {};
  const advances = values.advances   || {};
  const skills   = values.skills     || {};
  const texts    = values.texts      || {};
  const progress = values.progress   || {};
  const numbers  = values.numbers    || {};
  const readOnly = !onChange;

  const attrByKey = Object.fromEntries(
    (sections || []).flatMap(s => s.fields || []).filter(f => f.type === 'attr').map(f => [f.key, f])
  );

  const [expanded,        setExpanded]        = useState({});
  const [addingUnderPath, setAddingUnderPath] = useState(null);
  const [addingLabel,     setAddingLabel]     = useState('');
  const [addingAttr,      setAddingAttr]      = useState('');
  const [editingPath,     setEditingPath]     = useState(null);
  const [editingLabel,    setEditingLabel]    = useState('');
  const [editingAttr,     setEditingAttr]     = useState('');

  const confirmAdd = (parentPath) => {
    const trimmed = addingLabel.trim();
    if (!trimmed || !labelToKey(trimmed)) return;
    const key = `${parentPath}.${labelToKey(trimmed)}`;
    if (customSkillNodes[key]) return;
    onAddCustomSkill(key, { label: trimmed, ...(addingAttr ? { linkedAttr: addingAttr } : {}) });
    setAddingLabel('');
    setAddingAttr('');
    setAddingUnderPath(null);
  };

  const cancelAdd = () => { setAddingLabel(''); setAddingAttr(''); setAddingUnderPath(null); };

  const startEdit = (key, node) => {
    setEditingPath(key);
    setEditingLabel(node.label);
    setEditingAttr(node.linkedAttr || '');
  };

  const confirmEdit = (key) => {
    const trimmed = editingLabel.trim();
    if (trimmed && onUpdateCustomSkill) {
      onUpdateCustomSkill(key, { ...customSkillNodes[key], label: trimmed, ...(editingAttr ? { linkedAttr: editingAttr } : { linkedAttr: undefined }) });
    }
    setEditingPath(null);
    setEditingLabel('');
    setEditingAttr('');
  };

  const cancelEdit = () => { setEditingPath(null); setEditingLabel(''); setEditingAttr(''); };

  const renderAddForm = (parentPath, depth, fieldAssignAttr = false, attrFields = []) => (
    <div className="custom-sheet__skill-tree-add-form" style={{ paddingLeft: depth * 16 + 8 }}>
      <input
        type="text"
        className="custom-sheet__skill-tree-add-input"
        value={addingLabel}
        autoFocus
        onChange={e => setAddingLabel(e.target.value)}
        placeholder="Nazwa umiejętności…"
        onKeyDown={e => {
          if (e.key === 'Enter') confirmAdd(parentPath);
          if (e.key === 'Escape') cancelAdd();
        }}
      />
      {fieldAssignAttr && (
        <select
          className="custom-sheet__skill-attr-select"
          value={addingAttr}
          onChange={e => setAddingAttr(e.target.value)}
        >
          <option value="">— atrybut —</option>
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

  // Renders direct custom children of parentPath. Each node can itself have custom children.
  const renderCustomNodes = (parentPath, depth, allowPlayerAdd, fieldRollable, fieldAssignAttr = false) => {
    const directChildKeys = Object.keys(customSkillNodes).filter(key => {
      if (!key.startsWith(parentPath + '.')) return false;
      return !key.slice(parentPath.length + 1).includes('.');
    });
    if (directChildKeys.length === 0) return null;

    const attrFields = Object.values(attrByKey);

    return directChildKeys.map(key => {
      const node = customSkillNodes[key];
      const grandchildKeys = Object.keys(customSkillNodes).filter(k =>
        k.startsWith(key + '.') && !k.slice(key.length + 1).includes('.')
      );
      const hasChildren = grandchildKeys.length > 0;
      const isOpen = expanded[key] !== false;
      const showChildArea = (hasChildren || addingUnderPath === key) && (isOpen || addingUnderPath === key);
      const isEditing = editingPath === key;

      const nodeAttrInfo = fieldAssignAttr && node.linkedAttr ? attrByKey[node.linkedAttr] : null;
      const nodeDisplayLabel = nodeAttrInfo
        ? `${node.label} (${nodeAttrInfo.abbr || nodeAttrInfo.label})`
        : node.label;

      return (
        <div key={key} className="custom-sheet__skill-tree-group">
          <div className="custom-sheet__skill-tree-node-row custom-sheet__skill-tree-node-row--custom" style={{ paddingLeft: depth * 16 + 4 }}>
            <button
              className="custom-sheet__skill-tree-toggle"
              style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
              onClick={() => hasChildren && setExpanded(prev => ({ ...prev, [key]: !isOpen }))}
            >
              {isOpen ? '▾' : '▸'}
            </button>
            {isEditing ? (
              <>
                <input
                  type="text"
                  className="custom-sheet__skill-tree-add-input custom-sheet__skill-tree-edit-input"
                  value={editingLabel}
                  autoFocus
                  onChange={e => setEditingLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') confirmEdit(key); if (e.key === 'Escape') cancelEdit(); }}
                />
                {fieldAssignAttr && (
                  <select
                    className="custom-sheet__skill-attr-select"
                    value={editingAttr}
                    onChange={e => setEditingAttr(e.target.value)}
                  >
                    <option value="">— atrybut —</option>
                    {attrFields.map(f => <option key={f.key} value={f.key}>{f.abbr || f.label}</option>)}
                  </select>
                )}
                <button className="custom-sheet__skill-tree-add-confirm" onClick={() => confirmEdit(key)} disabled={!editingLabel.trim()}>✓</button>
                <button className="custom-sheet__skill-tree-add-cancel" onClick={cancelEdit}>✕</button>
              </>
            ) : (
              <>
                <span className="custom-sheet__skill-tree-node-label custom-sheet__skill-tree-node-label--custom">{nodeDisplayLabel}</span>
                <input
                  type="number"
                  className="custom-sheet__skill-val-input"
                  value={skills[key] ?? 0}
                  onChange={onChange ? e => onChange.skill(key, e.target.value) : undefined}
                  readOnly={readOnly}
                  min={0}
                />
                {fieldRollable && onRoll && (
                  <button className="custom-sheet__roll-btn" onClick={() => onRoll({ skillKey: key, label: node.label })}>
                    <CasinoIcon style={{ fontSize: 14 }} />
                  </button>
                )}
                {allowPlayerAdd && onAddCustomSkill && addingUnderPath !== key && (
                  <button
                    className="custom-sheet__skill-tree-add-inline"
                    onClick={() => { setAddingUnderPath(key); setAddingLabel(''); setAddingAttr(''); setExpanded(prev => ({ ...prev, [key]: true })); }}
                    title="Dodaj podrzędną umiejętność"
                  >+</button>
                )}
                {onUpdateCustomSkill && (
                  <button className="custom-sheet__skill-tree-edit" onClick={() => startEdit(key, node)} title="Edytuj nazwę">
                    <EditIcon style={{ fontSize: 11 }} />
                  </button>
                )}
                {onRemoveCustomSkill && (
                  <button className="custom-sheet__skill-tree-del" onClick={() => onRemoveCustomSkill(key)} title="Usuń">×</button>
                )}
              </>
            )}
          </div>
          {showChildArea && (
            <div>
              {renderCustomNodes(key, depth + 1, allowPlayerAdd, fieldRollable, fieldAssignAttr)}
              {addingUnderPath === key && renderAddForm(key, depth + 1, fieldAssignAttr, attrFields)}
            </div>
          )}
        </div>
      );
    });
  };

  // Every node — whether template-defined or not — shows value + roll + optional "+".
  const renderTreeNode = (node, depth, pathPrefix, allowPlayerAdd = false, fieldRollable = false, fieldAssignAttr = false) => {
    const path = pathPrefix ? `${pathPrefix}.${node.key}` : node.key;
    const templateChildren = node.children || [];
    const customDirectKeys = Object.keys(customSkillNodes).filter(k =>
      k.startsWith(path + '.') && !k.slice(path.length + 1).includes('.')
    );
    const hasChildren = templateChildren.length > 0 || customDirectKeys.length > 0;
    const isOpen = expanded[path] !== false;
    const showChildArea = (hasChildren || addingUnderPath === path) && (isOpen || addingUnderPath === path);

    const linkedAttrInfo = fieldAssignAttr && node.linkedAttr ? attrByKey[node.linkedAttr] : null;
    const displayLabel = linkedAttrInfo
      ? `${node.label} (${linkedAttrInfo.abbr || linkedAttrInfo.label})`
      : node.label;

    const attrFields = Object.values(attrByKey);

    return (
      <div key={path} className="custom-sheet__skill-tree-group">
        <div className="custom-sheet__skill-tree-node-row" style={{ paddingLeft: depth * 16 + 4 }}>
          <button
            className="custom-sheet__skill-tree-toggle"
            style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
            onClick={() => hasChildren && setExpanded(prev => ({ ...prev, [path]: !isOpen }))}
          >
            {isOpen ? '▾' : '▸'}
          </button>
          <span className="custom-sheet__skill-tree-node-label">{displayLabel}</span>
          <input
            type="number"
            className="custom-sheet__skill-val-input"
            value={skills[path] ?? 0}
            onChange={onChange ? e => onChange.skill(path, e.target.value) : undefined}
            readOnly={readOnly}
            min={0}
          />
          {fieldRollable && onRoll && (
            <button className="custom-sheet__roll-btn" onClick={() => onRoll({ skillKey: path, label: node.label })}>
              <CasinoIcon style={{ fontSize: 14 }} />
            </button>
          )}
          {allowPlayerAdd && onAddCustomSkill && addingUnderPath !== path && (
            <button
              className="custom-sheet__skill-tree-add-inline"
              onClick={() => { setAddingUnderPath(path); setAddingLabel(''); setAddingAttr(''); setExpanded(prev => ({ ...prev, [path]: true })); }}
              title="Dodaj podrzędną umiejętność"
            >+</button>
          )}
        </div>
        {showChildArea && (
          <div>
            {templateChildren.map(child => renderTreeNode(child, depth + 1, path, allowPlayerAdd, fieldRollable, fieldAssignAttr))}
            {renderCustomNodes(path, depth + 1, allowPlayerAdd, fieldRollable, fieldAssignAttr)}
            {addingUnderPath === path && renderAddForm(path, depth + 1, fieldAssignAttr, attrFields)}
          </div>
        )}
      </div>
    );
  };

  const renderField = (field) => {
    switch (field.type) {
      case 'attr': {
        if (field.hasAdvances) {
          const base = attrs[field.key] ?? 0;
          const adv  = advances[field.key] ?? 0;
          return (
            <div key={field.key} className="custom-sheet__field custom-sheet__field--number-advances">
              <label className="custom-sheet__field-label">{field.label}</label>
              <div className="custom-sheet__advances-row">
                <div className="custom-sheet__advances-cell">
                  <span className="custom-sheet__advances-sublabel">Bazowa</span>
                  <input
                    type="number"
                    className="custom-sheet__number-input"
                    value={base || ''}
                    onChange={onChange ? e => onChange.attr(field.key, e.target.value) : undefined}
                    readOnly={readOnly}
                    min={field.min ?? undefined}
                    max={field.max ?? undefined}
                  />
                </div>
                <div className="custom-sheet__advances-cell">
                  <span className="custom-sheet__advances-sublabel">{field.advancesLabel || 'Rozwinięcie'}</span>
                  <input
                    type="number"
                    className="custom-sheet__number-input"
                    value={adv || ''}
                    onChange={onChange ? e => onChange.advances(field.key, e.target.value) : undefined}
                    readOnly={readOnly}
                    min={0}
                  />
                </div>
                <div className="custom-sheet__advances-cell custom-sheet__advances-cell--sum">
                  <span className="custom-sheet__advances-sublabel">∑</span>
                  <span className="custom-sheet__advances-sum">{base + adv}</span>
                </div>
                {field.rollable && onRoll && (
                  <button
                    className="custom-sheet__roll-btn custom-sheet__roll-btn--advances"
                    onClick={() => onRoll({ skillKey: field.key, label: field.label })}
                  >
                    <CasinoIcon style={{ fontSize: 14 }} />
                  </button>
                )}
              </div>
            </div>
          );
        }
        return (
          <div key={field.key} className="custom-sheet__field custom-sheet__field--number">
            <label className="custom-sheet__field-label">{field.label}</label>
            <input
              type="number"
              className="custom-sheet__number-input"
              value={attrs[field.key] ?? ''}
              onChange={onChange ? e => onChange.attr(field.key, e.target.value) : undefined}
              readOnly={readOnly}
              min={field.min ?? undefined}
              max={field.max ?? undefined}
            />
            {field.rollable && onRoll && (
              <button className="custom-sheet__roll-btn" onClick={() => onRoll({ skillKey: field.key, label: field.label })}>
                <CasinoIcon style={{ fontSize: 14 }} />
              </button>
            )}
          </div>
        );
      }

      case 'number':
        return (
          <div key={field.key} className="custom-sheet__field custom-sheet__field--number">
            <label className="custom-sheet__field-label">{field.label}</label>
            <input
              type="number"
              className="custom-sheet__number-input"
              value={numbers[field.key] ?? ''}
              onChange={onChange ? e => onChange.number(field.key, e.target.value) : undefined}
              readOnly={readOnly}
              min={field.min ?? undefined}
              max={field.max ?? undefined}
            />
          </div>
        );

      case 'progress':
        return (
          <div key={field.key} className="custom-sheet__field custom-sheet__field--progress">
            <label className="custom-sheet__field-label">{field.label}</label>
            <div className="custom-sheet__progress-row">
              <input
                type="number"
                className="custom-sheet__progress-input"
                value={progress[field.key]?.current ?? 0}
                onChange={onChange ? e => onChange.progress(field.key, 'current', e.target.value) : undefined}
                readOnly={readOnly}
                min={0}
              />
              <span className="custom-sheet__progress-sep">/</span>
              <input
                type="number"
                className="custom-sheet__progress-input"
                value={progress[field.key]?.max ?? 0}
                onChange={onChange ? e => onChange.progress(field.key, 'max', e.target.value) : undefined}
                readOnly={readOnly}
                min={0}
              />
            </div>
          </div>
        );

      case 'text_short':
        return (
          <div key={field.key} className="custom-sheet__field custom-sheet__field--text">
            <label className="custom-sheet__field-label">{field.label}</label>
            <input
              type="text"
              className="custom-sheet__text-input"
              value={texts[field.key] || ''}
              onChange={onChange ? e => onChange.text(field.key, e.target.value) : undefined}
              readOnly={readOnly}
            />
          </div>
        );

      case 'text_long':
        return (
          <div key={field.key} className="custom-sheet__field custom-sheet__field--text">
            <label className="custom-sheet__field-label">{field.label}</label>
            <textarea
              className="custom-sheet__textarea"
              value={texts[field.key] || ''}
              onChange={onChange ? e => onChange.text(field.key, e.target.value) : undefined}
              readOnly={readOnly}
              rows={3}
            />
          </div>
        );

      case 'checkbox':
        return (
          <div key={field.key} className="custom-sheet__field custom-sheet__field--checkbox">
            <label className="custom-sheet__checkbox-label">
              <input
                type="checkbox"
                checked={!!(attrs[field.key])}
                onChange={onChange ? e => onChange.attr(field.key, e.target.checked ? 1 : 0) : undefined}
                disabled={readOnly}
              />
              <span>{field.label}</span>
            </label>
          </div>
        );

      case 'select':
        return (
          <div key={field.key} className="custom-sheet__field custom-sheet__field--select">
            <label className="custom-sheet__field-label">{field.label}</label>
            <select
              className="custom-sheet__select"
              value={texts[field.key] || ''}
              onChange={onChange ? e => onChange.text(field.key, e.target.value) : undefined}
              disabled={readOnly}
            >
              <option value="">—</option>
              {(field.options || []).map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
        );

      case 'skill_table': {
        const rows = field.options || [];
        return (
          <div key={field.key} className="custom-sheet__field custom-sheet__field--skill-table">
            <div className="custom-sheet__section-title">{field.label}</div>
            <div className="custom-sheet__skill-table">
              {rows.map((opt, idx) => {
                const skillName = typeof opt === 'string' ? opt : opt.label;
                const skillAttrKey = typeof opt === 'string' ? null : opt.attr;
                const skillKey = `${field.key}.${skillName.toLowerCase().replace(/\s+/g, '_')}`;
                const attrInfo = skillAttrKey ? attrByKey[skillAttrKey] : null;
                const displayName = attrInfo
                  ? `${skillName} (${attrInfo.abbr || attrInfo.label})`
                  : skillName;
                return (
                  <div key={skillKey} className="custom-sheet__skill-row">
                    <span className="custom-sheet__skill-name">{displayName}</span>
                    <input
                      type="number"
                      className="custom-sheet__skill-val-input"
                      value={skills[skillKey] ?? 0}
                      onChange={onChange ? e => onChange.skill(skillKey, e.target.value) : undefined}
                      readOnly={readOnly}
                      min={0}
                    />
                    {field.rollable && onRoll && (
                      <button className="custom-sheet__roll-btn" onClick={() => onRoll({ skillKey, label: skillName })}>
                        <CasinoIcon style={{ fontSize: 14 }} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      }

      case 'skill_tree': {
        const allowPlayerAdd  = !!field.playerCanAddSkills;
        const fieldRollable   = !!field.rollable;
        const fieldAssignAttr = !!field.assignAttrToSkill;
        const attrFields = Object.values(attrByKey);
        return (
          <div key={field.key} className="custom-sheet__field custom-sheet__field--skill-tree">
            <div className="custom-sheet__section-title">{field.label}</div>
            <div className="custom-sheet__skill-tree">
              {field.tree?.children?.map(child =>
                renderTreeNode(child, 0, field.key, allowPlayerAdd, fieldRollable, fieldAssignAttr)
              ) || (field.tree
                ? [renderTreeNode(field.tree, 0, '', allowPlayerAdd, fieldRollable, fieldAssignAttr)]
                : []
              )}
              {renderCustomNodes(field.key, 0, allowPlayerAdd, fieldRollable, fieldAssignAttr)}
              {allowPlayerAdd && onAddCustomSkill && (
                addingUnderPath === field.key
                  ? renderAddForm(field.key, 0, fieldAssignAttr, attrFields)
                  : <button
                      className="custom-sheet__skill-tree-add-btn"
                      style={{ paddingLeft: 8 }}
                      onClick={() => { setAddingUnderPath(field.key); setAddingLabel(''); setAddingAttr(''); }}
                    >+ dodaj</button>
              )}
            </div>
          </div>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div className="custom-sheet__sections">
      {(sections || []).map(section => (
        <div key={section.id} className="custom-sheet__section">
          {section.title && (
            <div className="custom-sheet__section-heading">{section.title}</div>
          )}
          <div className={`custom-sheet__fields custom-sheet__fields--${section.columns || 1}-col`}>
            {(section.fields || []).map(renderField)}
          </div>
        </div>
      ))}
    </div>
  );
}

export default CustomSheetBody;
