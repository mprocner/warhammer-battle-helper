import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import CasinoIcon from '@mui/icons-material/Casino';
import StarIcon from '@mui/icons-material/Star';
import { usePortalTooltip } from '../../components/common/PortalTooltip';
import { SECTION_TYPE, walkFields, nodeId } from '../../utils/templateSections';
import SkillTable from './fields/SkillTable';
import SkillTree from './fields/SkillTree';
import { AFFORDANCE_ICON_SIZE } from './fields/affordances';

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
  walkFields(sections, (f) => {
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
  });
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

// weaponDamageIncomplete reports whether any player-filled damage block is still empty.
// Internal to weaponRowIssue since FEATURE-208: a row has one completeness verdict, and
// callers need to know *which* part is missing, not just that something is.
// GM-fixed blocks (consts, fixed dice) and backend-resolved tokens (attr/skill) are always
// complete — a fully-fixed formula needs no input at all. Player dice must be positive; a
// player flat number (const_input) may be any number, including 0 or negative (a penalty),
// so we only require that it is filled.
function weaponDamageIncomplete(blocks, row) {
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

// weaponSkillColumn returns the column that supplies skills for this weapons_table, or null.
// A column qualifies only when it is BOTH a select AND flagged — the same predicate the
// backend rolls with (weapon.go:73). Testing the flag alone would let a column whose type
// was switched away from "select" shadow the live one, and the sheet would then disagree
// with the roll the server actually performs.
export function weaponSkillColumn(field) {
  return (field.columns || []).find(c => c.type === 'select' && c.optionsFromSkills) || null;
}

// weaponRowIssue names the reason a weapon row cannot be rolled, or null when it can.
// The skill wins over the damage when both are missing: columns render to the left of the
// damage blocks, so the tooltip points at the leftmost gap and moves right as the player
// fills them; and the damage formula resolves the same skill key (weapon.go:57), so an
// empty skill would silently contribute 0 to damage the player believes is complete.
export function weaponRowIssue(field, row) {
  const skillCol = weaponSkillColumn(field);
  if (skillCol && !(row.cells || {})[skillCol.key]) return 'skill';
  const blocks = field.damageFormula || [];
  if (blocks.length > 0 && weaponDamageIncomplete(blocks, row)) return 'damage';
  return null;
}

// weaponIssueTitle maps an issue to its tooltip. Written as literal t() calls rather than a
// built key ("customSheet.weaponIssue." + issue) so that grepping a key name still finds
// where it is used.
export function weaponIssueTitle(issue, t) {
  if (issue === 'skill')  return t('customSheet.weaponSkillMissing');
  if (issue === 'damage') return t('customSheet.weaponDamageIncomplete');
  return undefined;
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
  developmentSkills = [],
  onToggleDevelopment = null,
  renderChrome = null,
  showAffordances = false,
}) {
  const { t } = useTranslation();
  const attrs    = values.attributes || {};
  const skills   = values.skills     || {};
  const texts    = values.texts      || {};
  const progress = values.progress   || {};
  const numbers  = values.numbers    || {};
  const weapons  = values.weapons    || {};
  const readOnly = !onChange;

  // An affordance the player will see — the die on a rollable field, the favourites star, the
  // development checkbox, the player's own "add skill" button — is content, not editing furniture,
  // so the creator has to show it too. Without live handlers it renders static/disabled: the
  // creator's job is to look exactly like the sheet in play, and a control it silently drops is a
  // control the row width lies about (that gap is what hid FEATURE-212's bug). Gated on the
  // explicit `showAffordances` prop rather than on `renderChrome`'s presence, because the creator
  // has two renders — edit view and clean preview — and only one of them passes chrome.
  const rollAffordance = (onClick, { disabled = false, title = undefined, children = null } = {}) => {
    if (onRoll) {
      return (
        <button className="custom-sheet__roll-btn" onClick={onClick} disabled={disabled} title={title}>
          <CasinoIcon style={{ fontSize: AFFORDANCE_ICON_SIZE }} />
          {children}
        </button>
      );
    }
    if (showAffordances) {
      return (
        <span className="custom-sheet__roll-btn custom-sheet__roll-btn--static" aria-hidden="true">
          <CasinoIcon style={{ fontSize: AFFORDANCE_ICON_SIZE }} />
          {children}
        </span>
      );
    }
    return null;
  };

  const starAffordance = (skillKey) => {
    const active = favoriteSkills.includes(skillKey);
    if (onToggleFavorite) {
      return (
        <button
          className={`custom-sheet__star-btn${active ? ' custom-sheet__star-btn--active' : ''}`}
          onClick={() => onToggleFavorite(skillKey)}
          title={t('customSheet.favorite')}
        >
          <StarIcon style={{ fontSize: AFFORDANCE_ICON_SIZE }} />
        </button>
      );
    }
    if (showAffordances) {
      return (
        <span className="custom-sheet__star-btn custom-sheet__star-btn--static" aria-hidden="true">
          <StarIcon style={{ fontSize: AFFORDANCE_ICON_SIZE }} />
        </span>
      );
    }
    return null;
  };

  // The creator's edit view is this very component plus a decoration layer. `renderChrome` is
  // the only seam it needs: given a node and its path, the creator returns the affordances
  // (drag handle, edit button, duplicate-key badge) and this component positions them by
  // wrapping the node. With no prop the markup is exactly what the session has always
  // rendered — that byte-for-byte guarantee is what keeps a creator-only feature from
  // reaching every player's sheet. CustomSheetBody.domShape.test.jsx polices it.
  // `buildElement` is a thunk rather than a pre-built element: renderSection/renderField are
  // plain synchronous calls (not deferred React elements), so a node's own renderChrome must
  // fire before its subtree is built — otherwise a descendant's chrome would always run first
  // and callers (e.g. a creator's drag-and-drop index) would see children before their parent.
  const withChrome = (node, path, buildElement) => {
    if (!renderChrome) return buildElement();
    // Chrome is computed before the subtree so a node's own affordances are registered ahead of
    // its descendants': renderSection/renderField are plain synchronous calls, not deferred
    // React elements, so a pre-built child would always run its chrome first.
    const chrome = renderChrome(node, path);
    const element = buildElement();
    // A node that renders to nothing gets no wrapper and no chrome. The already-computed chrome
    // is dropped, which costs one wasted call on a node that cannot appear on screen anyway —
    // the alternative, building the element first to test it, would reintroduce the very
    // bottom-up ordering this helper exists to avoid.
    if (!element) return element;
    return (
      <div className="custom-sheet__editable" key={nodeId(node)}>
        {element}
        {chrome}
      </div>
    );
  };

  const attrByKey = useMemo(() => {
    const out = {};
    walkFields(sections, (f) => { if (f.type === 'attr') out[f.key] = f; });
    return out;
  }, [sections]);

  // Jedna instancja na całą kartę: jeden stan i jeden portal niezależnie od liczby pól.
  // Hook per etykieta dałby 40 niezależnych stanów przy karcie z 40 polami.
  const { showTooltip, hideTooltip, tooltipNode } = usePortalTooltip();

  const [editingPath,     setEditingPath]     = useState(null);

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

  const renderField = (field, path) => {
    switch (field.type) {
      case 'attr': {
        const rollBtn = field.rollable && rollAffordance(() => onRoll({ skillKey: field.key, label: field.label }));

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
                    step={field.step || 1}
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
                    step={field.step || 1}
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
              step={field.step || 1}
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
              step={field.step || 1}
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
        // Reserve a track only when something can actually render into it — a permanently empty
        // column with its gap becomes a visible gap. These three flags are the sheet's affordance
        // policy, which is why SkillTable takes them as booleans instead of inferring them from
        // the render props below.
        const showRoll    = !!field.rollable && (!!onRoll || showAffordances);
        const showStar    = !field.hideFavorites && (!!onToggleFavorite || showAffordances);
        const showActions = !!field.playerCanAddSkills && (!!onAddCustomSkill || showAffordances);

        return (
          <SkillTable
            key={field.key}
            field={field}
            skills={skills}
            attrs={attrs}
            attrByKey={attrByKey}
            customSkillNodes={customSkillNodes}
            developmentSkills={developmentSkills}
            onToggleDevelopment={onToggleDevelopment}
            onChange={onChange}
            readOnly={readOnly}
            onAddCustomSkill={onAddCustomSkill}
            onRemoveCustomSkill={onRemoveCustomSkill}
            onUpdateCustomSkill={onUpdateCustomSkill}
            editingPath={editingPath}
            setEditingPath={setEditingPath}
            showTooltip={showTooltip}
            hideTooltip={hideTooltip}
            showStar={showStar}
            showRoll={showRoll}
            showActions={showActions}
            renderStar={starAffordance}
            renderRoll={(row) => rollAffordance(() => onRoll({ skillKey: row.key, label: row.label }))}
          />
        );
      }

      case 'weapons_table': {
        const cols = field.columns || [];
        const rows = weapons[field.key] || [];
        const dmgBlocks = field.damageFormula || [];
        const hasDamage = dmgBlocks.length > 0;
        const skillOptions = !!weaponSkillColumn(field)
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
                const issue = weaponRowIssue(field, preset);
                return (
                  <div key={preset.id} className="custom-sheet__weapon-row custom-sheet__weapon-row--preset">
                    {onToggleFavorite && (
                      <button
                        className={`custom-sheet__star-btn${favoriteWeapons.includes(preset.id) ? ' custom-sheet__star-btn--active' : ''}`}
                        onClick={() => onChange && onChange.weaponFavorite(preset.id)}
                        disabled={readOnly}
                      >
                        <StarIcon style={{ fontSize: AFFORDANCE_ICON_SIZE }} />
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
                      {field.rollable && rollAffordance(
                        () => !issue && onRoll({ weaponFieldKey: field.key, weaponRowId: preset.id, label: weaponRowLabel(field, preset, t) }),
                        { disabled: !!issue, title: weaponIssueTitle(issue, t) }
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
                      className={`custom-sheet__star-btn${favoriteWeapons.includes(row.id) ? ' custom-sheet__star-btn--active' : ''}`}
                      onClick={() => onChange && onChange.weaponFavorite(row.id)}
                      disabled={readOnly}
                    >
                      <StarIcon style={{ fontSize: AFFORDANCE_ICON_SIZE }} />
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
                    {field.rollable && (() => {
                      const issue = weaponRowIssue(field, row);
                      return rollAffordance(
                        () => !issue && onRoll({ weaponFieldKey: field.key, weaponRowId: row.id, label: weaponRowLabel(field, row, t) }),
                        { disabled: !!issue, title: weaponIssueTitle(issue, t) }
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
        // Reserve a track only when something can actually render into it. These three flags are
        // the sheet's affordance policy, which is why SkillTree takes them as booleans instead of
        // inferring them from the render props below.
        const showRoll    = !!field.rollable && (!!onRoll || showAffordances);
        const showStar    = !field.hideFavorites && (!!onToggleFavorite || showAffordances);
        const showActions = !!field.playerCanAddSkills && (!!onAddCustomSkill || showAffordances);

        return (
          <SkillTree
            key={field.key}
            field={field}
            skills={skills}
            attrByKey={attrByKey}
            customSkillNodes={customSkillNodes}
            developmentSkills={developmentSkills}
            onToggleDevelopment={onToggleDevelopment}
            onChange={onChange}
            readOnly={readOnly}
            onAddCustomSkill={onAddCustomSkill}
            onRemoveCustomSkill={onRemoveCustomSkill}
            onUpdateCustomSkill={onUpdateCustomSkill}
            editingPath={editingPath}
            setEditingPath={setEditingPath}
            showTooltip={showTooltip}
            hideTooltip={hideTooltip}
            showStar={showStar}
            showRoll={showRoll}
            showActions={showActions}
            renderStar={starAffordance}
            renderRoll={(row) => rollAffordance(() => onRoll({ skillKey: row.key, label: row.label }))}
          />
        );
      }

      case SECTION_TYPE:
        return field.section ? renderSection(field.section, true, path) : null;

      default:
        return null;
    }
  };

  // renderSection draws one section and recurses through renderField into nested ones.
  // `nested` is a boolean rather than a depth number on purpose: the styling has exactly two
  // states (root and nested), and depth is unbounded, so a depth-indexed class would need an
  // arbitrary cap that the model does not have.
  //
  // `path` is this section's own address in the same number[] form utils/templateSections.js
  // uses. It is threaded rather than recomputed so the creator's chrome, the tree operations
  // and the drag-and-drop index all speak one vocabulary.
  const renderSection = (section, nested, path) => (
    <div
      key={section.id}
      className={`custom-sheet__section${nested ? ' custom-sheet__section--nested' : ''}`}
    >
      {section.title && (
        <div className={`custom-sheet__section-heading${nested ? ' custom-sheet__section-heading--nested' : ''}`}>
          {section.title}
        </div>
      )}
      <div className={`custom-sheet__fields custom-sheet__fields--${section.columns || 1}-col`}>
        {(section.fields || []).map((child, i) =>
          withChrome(child, [...path, i], () => renderField(child, [...path, i]))
        )}
      </div>
    </div>
  );

  return (
    <>
      <div className="custom-sheet__sections">
        {(sections || []).map((section, i) =>
          withChrome(section, [i], () => renderSection(section, false, [i]))
        )}
      </div>
      {tooltipNode}
    </>
  );
}

export default CustomSheetBody;
