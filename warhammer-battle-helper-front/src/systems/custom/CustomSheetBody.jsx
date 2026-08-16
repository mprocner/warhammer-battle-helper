import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import CasinoIcon from '@mui/icons-material/Casino';
import EditIcon from '@mui/icons-material/Edit';
import StarIcon from '@mui/icons-material/Star';
import { usePortalTooltip } from '../../components/common/PortalTooltip';

// genId mints a stable, opaque key for a player-added skill node — never derived from the
// typed name, so two skills can share a name and renaming never affects the key. Matches the
// surrogate-key convention used GM-side in TemplateBuilder.
function genId(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

const DMG_OP_SYMBOL = { '+': '+', '-': '−', '*': '×', '/': '÷' };

// weaponRowLabel picks a display name for a weapon row: the first text column's value,
// then any non-empty cell, falling back to the field label.
export function weaponRowLabel(field, row, t) {
  const cells = row.cells || {};
  for (const c of (field.columns || [])) {
    if (c.type === 'text' && (cells[c.key] || '').trim()) return cells[c.key].trim();
  }
  for (const c of (field.columns || [])) {
    if ((cells[c.key] || '').trim()) return cells[c.key].trim();
  }
  return field.label || t('customSheet.weapon');
}

// collectSkillOptions gathers {key, label} for every skill the character has, so a
// weapons_table "from skills" select can offer them. Keys must match how rolls resolve:
// skill_table rows use `${field.key}.${opt.id}` (stable id, not the label), skill_tree nodes
// use the dot-path `${field.key}.${node.key}…`, and player-added nodes are keyed directly.
export function collectSkillOptions(sections, customSkillNodes) {
  const out = [];
  const seen = new Set();
  const push = (key, label) => { if (key && !seen.has(key)) { seen.add(key); out.push({ key, label: label || key }); } };
  for (const s of (sections || [])) {
    for (const f of (s.fields || [])) {
      if (f.type === 'skill_table') {
        for (const opt of (f.skills || [])) {
          if (opt.label) push(`${f.key}.${opt.id}`, opt.label);
        }
      } else if (f.type === 'skill_tree' && f.tree) {
        const walk = (node, prefix) => {
          const path = prefix ? `${prefix}.${node.key}` : node.key;
          push(path, node.label);
          (node.children || []).forEach(ch => walk(ch, path));
        };
        (f.tree.children || []).forEach(ch => walk(ch, f.key));
      }
    }
  }
  for (const [key, node] of Object.entries(customSkillNodes || {})) push(key, node.label);
  return out;
}

// diceFaces returns a dice block's fixed face count (e.g. 10 for "d10"), or null when the
// block is a "generic" die ("d" with no number) that the player fills in per weapon.
export function diceFaces(b) {
  const n = Number(String(b.value || '').replace(/^d/, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// isPlayerDie reports whether a dice block is filled by the player on the sheet (generic die)
// rather than fixed by the GM. Only player dice are editable and validated before a roll.
export function isPlayerDie(b) {
  return b.type === 'dice' && diceFaces(b) === null;
}

// weaponDamageIncomplete reports whether any player-filled block is still empty, so the sheet
// can block the roll. GM-fixed blocks (consts, fixed dice) and backend-resolved tokens
// (attr/skill) are always complete — a fully-fixed formula needs no input at all. Player dice
// must be positive; a player flat number (const_input) may be any number, including 0 or
// negative (a penalty), so we only require that it is filled.
export function weaponDamageIncomplete(blocks, row) {
  const dmg = row.damage || {};
  for (const b of (blocks || [])) {
    if (b.type === 'const_input') {
      const v = dmg[b.id];
      if (v === '' || v == null || !Number.isFinite(Number(v))) return true;
    } else if (isPlayerDie(b)) {
      const v = dmg[b.id];
      if (v === '' || v == null || !Number.isFinite(Number(v)) || Number(v) <= 0) return true;
    }
  }
  return false;
}

// renderDamageFormula renders a weapon's damage skeleton inline. Numeric blocks (const
// values, die faces) become editable inputs bound to row.damage[block.id]; attribute and
// skill tokens are static — the backend resolves them from stats at roll time.
export function renderDamageFormula(blocks, row, fieldKey, onChange, readOnly, t) {
  const dmg = row.damage || {};
  const onDmg = (blockId, val) => onChange && onChange.weaponDamage(fieldKey, row.id, blockId, val);
  return (blocks || []).map(b => {
    switch (b.type) {
      case 'op':
        if (b.value === 'd') return null; // structural — the dice block renders its own "d"
        return <span key={b.id} className="custom-sheet__weapon-dmg-op">{DMG_OP_SYMBOL[b.value] || b.value}</span>;
      case 'const':
        // GM-fixed constant — same for every weapon, shown read-only.
        return <span key={b.id} className="custom-sheet__weapon-dmg-fixed">{b.num ?? 0}</span>;
      case 'const_input': {
        // Player-filled flat number per weapon; empty blocks the roll.
        const cv = dmg[b.id] ?? '';
        return (
          <input
            key={b.id}
            type="number"
            className={`custom-sheet__weapon-dmg-input${cv === '' ? ' custom-sheet__weapon-dmg-input--missing' : ''}`}
            value={cv}
            placeholder="?"
            onChange={onChange ? e => onDmg(b.id, e.target.value) : undefined}
            readOnly={readOnly}
          />
        );
      }
      case 'dice': {
        const faces = diceFaces(b);
        if (faces !== null) {
          // GM-fixed die (e.g. d10) — same for every weapon, shown read-only.
          return <span key={b.id} className="custom-sheet__weapon-dmg-fixed">d{faces}</span>;
        }
        // Generic die — the player fills its faces per weapon; empty blocks the roll.
        const v = dmg[b.id] ?? '';
        return (
          <span key={b.id} className="custom-sheet__weapon-dmg-dice">
            d
            <input
              type="number"
              className={`custom-sheet__weapon-dmg-input${v === '' ? ' custom-sheet__weapon-dmg-input--missing' : ''}`}
              value={v}
              placeholder="?"
              onChange={onChange ? e => onDmg(b.id, e.target.value) : undefined}
              readOnly={readOnly}
              min={1}
            />
          </span>
        );
      }
      case 'dice_attr':
        return <span key={b.id} className="custom-sheet__weapon-dmg-token">d({b.label || b.key})</span>;
      case 'dice_skill_attr':
        return <span key={b.id} className="custom-sheet__weapon-dmg-token">d(±)</span>;
      case 'attr':
        return <span key={b.id} className="custom-sheet__weapon-dmg-token">{b.label || b.key}</span>;
      case 'skill':
        return <span key={b.id} className="custom-sheet__weapon-dmg-token">{t('creator.formula.skillAbbr')}</span>;
      case 'attr_linked':
        return <span key={b.id} className="custom-sheet__weapon-dmg-token">{t('creator.formula.linkedAttrAbbr')}</span>;
      default:
        return null;
    }
  });
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
  favoriteSkills = [],
  favoriteWeapons = [],
  onToggleFavorite = null,
}) {
  const { t } = useTranslation();
  const attrs    = values.attributes || {};
  const skills   = values.skills     || {};
  const texts    = values.texts      || {};
  const progress = values.progress   || {};
  const numbers  = values.numbers    || {};
  const weapons  = values.weapons    || {};
  const readOnly = !onChange;

  const attrByKey = Object.fromEntries(
    (sections || []).flatMap(s => s.fields || []).filter(f => f.type === 'attr').map(f => [f.key, f])
  );

  // Jedna instancja na całą kartę: jeden stan i jeden portal niezależnie od liczby pól.
  // Hook per etykieta dałby 40 niezależnych stanów przy karcie z 40 polami.
  const { showTooltip, hideTooltip, tooltipNode } = usePortalTooltip();

  const [expanded,        setExpanded]        = useState({});
  const [addingUnderPath, setAddingUnderPath] = useState(null);
  const [addingLabel,     setAddingLabel]     = useState('');
  const [addingAttr,      setAddingAttr]      = useState('');
  const [editingPath,     setEditingPath]     = useState(null);
  const [editingLabel,    setEditingLabel]    = useState('');
  const [editingAttr,     setEditingAttr]     = useState('');

  const confirmAdd = (parentPath) => {
    const trimmed = addingLabel.trim();
    if (!trimmed) return;
    const key = `${parentPath}.${genId('skill')}`;
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
                  value={skills[key]?.base ?? 0}
                  onChange={onChange ? e => onChange.skill(key, e.target.value) : undefined}
                  readOnly={readOnly}
                  min={0}
                />
                {onToggleFavorite && (
                  <button
                    className={`coc-star-btn${favoriteSkills.includes(key) ? ' coc-star-btn--active' : ''}`}
                    onClick={() => onToggleFavorite(key)}
                  >
                    <StarIcon style={{ fontSize: 12 }} />
                  </button>
                )}
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
            value={skills[path]?.base ?? 0}
            onChange={onChange ? e => onChange.skill(path, e.target.value) : undefined}
            readOnly={readOnly}
            min={0}
          />
          {onToggleFavorite && (
            <button
              className={`coc-star-btn${favoriteSkills.includes(path) ? ' coc-star-btn--active' : ''}`}
              onClick={() => onToggleFavorite(path)}
            >
              <StarIcon style={{ fontSize: 12 }} />
            </button>
          )}
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

  // renderFieldLabel emits a field's name truncated to its grid column. The tooltip fires only
  // when the text is actually clipped: the ellipsis is what tells the player there is more to
  // read, so a label that fits needs no hover hint. scrollWidth is the untruncated content
  // width, clientWidth the visible box — they differ exactly when overflow:hidden cut something.
  const renderFieldLabel = (text) => (
    <label
      className="custom-sheet__field-label"
      onMouseEnter={e => {
        const el = e.currentTarget;
        if (el.scrollWidth > el.clientWidth) showTooltip(text, el);
      }}
      onMouseLeave={hideTooltip}
    >
      {text}
    </label>
  );

  const renderField = (field) => {
    switch (field.type) {
      case 'attr': {
        const rollBtn = field.rollable && onRoll && (
          <button
            className="custom-sheet__roll-btn"
            onClick={() => onRoll({ skillKey: field.key, label: field.label })}
          >
            <CasinoIcon style={{ fontSize: 14 }} />
          </button>
        );

        if (field.hasAdvances) {
          const base = attrs[field.key]?.base     ?? 0;
          const adv  = attrs[field.key]?.advances ?? 0;
          const total = attrs[field.key]?.current ?? (base + adv);
          return (
            <div key={field.key} className="custom-sheet__attr">
              <div className="custom-sheet__attr-header">
                {renderFieldLabel(field.label)}
                {rollBtn}
              </div>
              <div className="custom-sheet__attr-rows">
                <div className="custom-sheet__attr-row">
                  <span className="custom-sheet__attr-row-label">{t('customSheet.base')}</span>
                  <input
                    type="number"
                    className="custom-sheet__attr-input"
                    value={base || ''}
                    onChange={onChange ? e => onChange.attr(field.key, e.target.value) : undefined}
                    readOnly={readOnly}
                    min={field.min ?? undefined}
                    max={field.max ?? undefined}
                  />
                </div>
                <div className="custom-sheet__attr-row">
                  <span className="custom-sheet__attr-row-label">{field.advancesLabel || t('customSheet.advances')}</span>
                  <input
                    type="number"
                    className="custom-sheet__attr-input custom-sheet__attr-input--adv"
                    value={adv || ''}
                    onChange={onChange ? e => onChange.advances(field.key, e.target.value) : undefined}
                    readOnly={readOnly}
                    min={0}
                  />
                </div>
                <div className="custom-sheet__attr-row">
                  <span className="custom-sheet__attr-row-label">{t('customSheet.total')}</span>
                  <span className="custom-sheet__attr-total">{total}</span>
                </div>
              </div>
            </div>
          );
        }
        return (
          <div key={field.key} className="custom-sheet__attr custom-sheet__attr--simple">
            <div className="custom-sheet__attr-header">
              {renderFieldLabel(field.label)}
              {rollBtn}
            </div>
            <input
              type="number"
              className="custom-sheet__attr-input"
              value={attrs[field.key]?.base ?? ''}
              onChange={onChange ? e => onChange.attr(field.key, e.target.value) : undefined}
              readOnly={readOnly}
              min={field.min ?? undefined}
              max={field.max ?? undefined}
            />
          </div>
        );
      }

      case 'number':
        return (
          <div key={field.key} className="custom-sheet__field custom-sheet__field--number">
            {renderFieldLabel(field.label)}
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
            {renderFieldLabel(field.label)}
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
            {renderFieldLabel(field.label)}
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
            {renderFieldLabel(field.label)}
            <textarea
              className="custom-sheet__textarea"
              value={texts[field.key] || ''}
              onChange={onChange ? e => onChange.text(field.key, e.target.value) : undefined}
              readOnly={readOnly}
              rows={3}
            />
          </div>
        );

      // A label renders template text only — it has no per-character value, hence no <label>
      // element (there is no control to label) and no onChange path. field.text stays plain
      // text: the GM writes it, but every player in the session renders it.
      case 'label':
        return (
          <div key={field.key} className="custom-sheet__field custom-sheet__field--label">
            <div
              className={`custom-sheet__label-text custom-sheet__label-text--${field.textSize || 'normal'}`}
              style={field.textColor ? { color: field.textColor } : undefined}
            >
              {field.text}
            </div>
          </div>
        );

      case 'checkbox':
        return (
          <div key={field.key} className="custom-sheet__field custom-sheet__field--checkbox">
            <label className="custom-sheet__checkbox-label">
              <input
                type="checkbox"
                checked={!!(attrs[field.key]?.base)}
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
            {renderFieldLabel(field.label)}
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
        const rows = field.skills || [];
        const hasAdv = !!field.hasAdvances;
        const advLabel = field.advancesLabel || t('customSheet.advances');
        return (
          <div key={field.key} className="custom-sheet__field custom-sheet__field--skill-table">
            <div className="custom-sheet__section-title">{field.label}</div>
            <div className="custom-sheet__skill-table">
              {hasAdv && (
                <div className="custom-sheet__skill-table-header">
                  <span className="custom-sheet__skill-col-label custom-sheet__skill-col-label--name" />
                  <span className="custom-sheet__skill-col-label custom-sheet__skill-col-label--base">{t('customSheet.base')}</span>
                  <span className="custom-sheet__skill-col-label custom-sheet__skill-col-label--adv">{advLabel}</span>
                  <span className="custom-sheet__skill-col-label custom-sheet__skill-col-label--total">{t('customSheet.total')}</span>
                </div>
              )}
              {rows.map((opt) => {
                const skillName = opt.label;
                const skillAttrKey = opt.attr;
                const skillKey = `${field.key}.${opt.id}`;
                const attrInfo = skillAttrKey ? attrByKey[skillAttrKey] : null;
                const displayName = attrInfo
                  ? `${skillName} (${attrInfo.abbr || attrInfo.label})`
                  : skillName;
                const sv = skills[skillKey] || {};
                const base = sv.base ?? 0;
                const adv = sv.advances ?? 0;
                const total = sv.current ?? (base + adv);
                return (
                  <div key={skillKey} className={`custom-sheet__skill-row${hasAdv ? ' custom-sheet__skill-row--advances' : ''}`}>
                    <span className="custom-sheet__skill-name">{displayName}</span>
                    <input
                      type="number"
                      className={`custom-sheet__skill-val-input${hasAdv ? ' custom-sheet__skill-val-input--base' : ''}`}
                      value={hasAdv ? (base || '') : base}
                      onChange={onChange ? e => onChange.skill(skillKey, e.target.value) : undefined}
                      readOnly={readOnly}
                      min={0}
                    />
                    {hasAdv && (
                      <>
                        <input
                          type="number"
                          className="custom-sheet__skill-val-input custom-sheet__skill-val-input--adv"
                          value={adv || ''}
                          onChange={onChange ? e => onChange.skillAdvances(skillKey, e.target.value) : undefined}
                          readOnly={readOnly}
                          min={0}
                        />
                        <span className="custom-sheet__skill-val-total">{total}</span>
                      </>
                    )}
                    {onToggleFavorite && (
                      <button
                        className={`coc-star-btn${favoriteSkills.includes(skillKey) ? ' coc-star-btn--active' : ''}`}
                        onClick={() => onToggleFavorite(skillKey)}
                      >
                        <StarIcon style={{ fontSize: 12 }} />
                      </button>
                    )}
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

      case 'weapons_table': {
        const cols = field.columns || [];
        const rows = weapons[field.key] || [];
        const dmgBlocks = field.damageFormula || [];
        const hasDamage = dmgBlocks.length > 0;
        const skillOptions = cols.some(c => c.type === 'select' && c.optionsFromSkills)
          ? collectSkillOptions(sections, customSkillNodes)
          : [];
        const presets = field.presetWeapons || [];
        const alwaysOnPresets = presets.filter(p => p.alwaysOn);
        const catalogPresets  = presets.filter(p => !p.alwaysOn);

        // Resolves a select cell to its display label (skill name or option label).
        const cellLabel = (c, val) => {
          if (c.type !== 'select') return val;
          const opts = c.optionsFromSkills
            ? skillOptions
            : (c.options || []).map(o => ({ key: o, label: o }));
          return opts.find(o => o.key === val)?.label || val;
        };

        return (
          <div key={field.key} className="custom-sheet__field custom-sheet__field--weapon-table">
            <div className="custom-sheet__section-title">{field.label}</div>
            <div className="custom-sheet__weapon-table">
              <div className="custom-sheet__weapon-table-header">
                <span className="custom-sheet__weapon-col--star" />
                {cols.map(c => (
                  <span key={c.key} className="custom-sheet__weapon-col-label">{c.label}</span>
                ))}
                {hasDamage && <span className="custom-sheet__weapon-col-label">{t('customSheet.damage')}</span>}
                <span className="custom-sheet__weapon-col--actions" />
              </div>

              {/* GM "always on" weapons — read-only, rendered straight from the template so a
                  GM edit reaches every player; rolled by preset id, never copied into stats. */}
              {alwaysOnPresets.map(preset => {
                const incomplete = hasDamage && weaponDamageIncomplete(dmgBlocks, preset);
                return (
                  <div key={preset.id} className="custom-sheet__weapon-row custom-sheet__weapon-row--preset">
                    {onToggleFavorite && (
                      <button
                        className={`coc-star-btn${favoriteWeapons.includes(preset.id) ? ' coc-star-btn--active' : ''}`}
                        onClick={() => onChange && onChange.weaponFavorite(preset.id)}
                        disabled={readOnly}
                      >
                        <StarIcon style={{ fontSize: 12 }} />
                      </button>
                    )}
                    {cols.map(c => (
                      <span key={c.key} className="custom-sheet__weapon-cell-static">
                        {cellLabel(c, (preset.cells && preset.cells[c.key]) || '') || '—'}
                      </span>
                    ))}
                    {hasDamage && (
                      <div className="custom-sheet__weapon-damage">
                        {renderDamageFormula(dmgBlocks, preset, field.key, null, true, t)}
                      </div>
                    )}
                    <div className="custom-sheet__weapon-actions">
                      {field.rollable && onRoll && (
                        <button
                          className="custom-sheet__roll-btn"
                          onClick={() => !incomplete && onRoll({ weaponFieldKey: field.key, weaponRowId: preset.id, label: weaponRowLabel(field, preset, t) })}
                          disabled={incomplete}
                          title={incomplete ? t('customSheet.weaponDamageIncomplete') : undefined}
                        >
                          <CasinoIcon style={{ fontSize: 14 }} />
                        </button>
                      )}
                      <span className="custom-sheet__weapon-lock" title={t('customSheet.weaponPresetLocked')}>🔒</span>
                    </div>
                  </div>
                );
              })}

              {rows.map(row => (
                <div key={row.id} className="custom-sheet__weapon-row">
                  {onToggleFavorite && (
                    <button
                      className={`coc-star-btn${favoriteWeapons.includes(row.id) ? ' coc-star-btn--active' : ''}`}
                      onClick={() => onChange && onChange.weaponFavorite(row.id)}
                      disabled={readOnly}
                    >
                      <StarIcon style={{ fontSize: 12 }} />
                    </button>
                  )}

                  {cols.map(c => {
                    const val = (row.cells && row.cells[c.key]) || '';
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
                          disabled={readOnly}
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
                        readOnly={readOnly}
                      />
                    );
                  })}

                  {hasDamage && (
                    <div className="custom-sheet__weapon-damage">
                      {renderDamageFormula(dmgBlocks, row, field.key, onChange, readOnly, t)}
                    </div>
                  )}

                  <div className="custom-sheet__weapon-actions">
                    {field.rollable && onRoll && (() => {
                      const incomplete = hasDamage && weaponDamageIncomplete(dmgBlocks, row);
                      return (
                        <button
                          className="custom-sheet__roll-btn"
                          onClick={() => !incomplete && onRoll({ weaponFieldKey: field.key, weaponRowId: row.id, label: weaponRowLabel(field, row, t) })}
                          disabled={incomplete}
                          title={incomplete ? t('customSheet.weaponDamageIncomplete') : undefined}
                        >
                          <CasinoIcon style={{ fontSize: 14 }} />
                        </button>
                      );
                    })()}
                    {onChange && (
                      <button
                        className="custom-sheet__weapon-remove"
                        onClick={() => onChange.weaponRemove(field.key, row.id)}
                        title={t('customSheet.removeWeapon')}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {onChange && (
                <div className="custom-sheet__weapon-add-row">
                  <button className="custom-sheet__weapon-add-btn" onClick={() => onChange.weaponAdd(field.key)}>
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
    <>
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
      {tooltipNode}
    </>
  );
}

export default CustomSheetBody;
