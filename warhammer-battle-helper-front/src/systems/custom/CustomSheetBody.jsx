import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import CasinoIcon from '@mui/icons-material/Casino';
import StarIcon from '@mui/icons-material/Star';
import FunctionsIcon from '@mui/icons-material/Functions';
import { usePortalTooltip } from '../../components/common/PortalTooltip';
import { SECTION_TYPE, walkFields, nodeId } from '../../utils/templateSections';
import { computeFieldValue, formulaRefsOf } from './formula/formula';
import SkillTable from './fields/SkillTable';
import SkillTree from './fields/SkillTree';
import WeaponsTable from './fields/WeaponsTable';
import { AFFORDANCE_ICON_SIZE } from './fields/affordances';

// onChange = { attr, advances, skill, skillAdvances, text, progress, number, weaponAdd,
//              weaponAddFromPreset, weaponRemove, weaponCell, weaponDamage, weaponFavorite }
//            | null (read-only)
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

  const formulaRefs = useMemo(() => formulaRefsOf(sections), [sections]);

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

  // renderTile is the shared skeleton of number, progress, computed and text fields: a head row
  // (name + icon slot), a value row of fixed minimum height, and an optional strip along the
  // bottom edge. One anatomy for all four is what lets them sit side by side in a grid row with
  // names and values on the same lines; the type only decides what fills the value row.
  const renderTile = (field, typeMod, value, { icon = null, footer = null } = {}) => (
    <div key={field.key} className={`custom-sheet__tile custom-sheet__tile--${typeMod}`}>
      <div className="custom-sheet__tile-head">
        {renderFieldLabel(field.label)}
        {icon}
      </div>
      <div className="custom-sheet__tile-value">{value}</div>
      {footer}
    </div>
  );

  const renderField = (field, path) => {
    switch (field.type) {
      // Medallion: the total the player rolls against sits large in a plate, its editable parts
      // small beside it. Simple mode is the same medallion with the number itself editable.
      case 'attr': {
        const rollBtn = field.rollable && rollAffordance(() => onRoll({ skillKey: field.key, label: field.label }));
        const header = (
          <div className="custom-sheet__attr-header">
            {renderFieldLabel(field.label)}
            {rollBtn}
          </div>
        );

        if (field.hasAdvances) {
          const base = attrs[field.key]?.base     ?? 0;
          const adv  = attrs[field.key]?.advances ?? 0;
          const total = attrs[field.key]?.current ?? (base + adv);
          return (
            <div key={field.key} className="custom-sheet__attr">
              {header}
              <div className="custom-sheet__attr-body">
                <div className="custom-sheet__attr-parts">
                  <label className="custom-sheet__attr-part">
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
                    <span className="custom-sheet__attr-caption">{t('customSheet.baseShort')}</span>
                  </label>
                  <span className="custom-sheet__attr-op">+</span>
                  <label className="custom-sheet__attr-part">
                    <input
                      type="number"
                      className="custom-sheet__attr-input custom-sheet__attr-input--adv"
                      value={adv || ''}
                      onChange={onChange ? e => onChange.advances(field.key, e.target.value) : undefined}
                      readOnly={readOnly}
                      step={field.step || 1}
                    />
                    <span className="custom-sheet__attr-caption">{field.advancesLabel || t('customSheet.advancesShort')}</span>
                  </label>
                </div>
                <output className="custom-sheet__attr-total">{total}</output>
              </div>
            </div>
          );
        }
        return (
          <div key={field.key} className="custom-sheet__attr">
            {header}
            <div className="custom-sheet__attr-body">
              <input
                type="number"
                className="custom-sheet__attr-input custom-sheet__attr-input--solo"
                value={attrs[field.key]?.base ?? ''}
                onChange={onChange ? e => onChange.attr(field.key, e.target.value) : undefined}
                readOnly={readOnly}
                min={field.min ?? undefined}
                max={field.max ?? undefined}
                step={field.step || 1}
              />
            </div>
          </div>
        );
      }

      case 'number':
        return renderTile(field, 'number', (
          <input
            type="number"
            className="custom-sheet__tile-input"
            value={numbers[field.key] ?? ''}
            onChange={onChange ? e => onChange.number(field.key, e.target.value) : undefined}
            readOnly={readOnly}
            min={field.min ?? undefined}
            max={field.max ?? undefined}
            step={field.step || 1}
          />
        ));

      // Computed at render from the values the sheet is showing — the player's unsaved edits
      // included — so it follows every keystroke. Nothing is stored: there is no onChange.
      case 'computed': {
        const value = computeFieldValue(field, { attributes: attrs, numbers }, formulaRefs);
        return renderTile(field, 'computed', (
          <output className="custom-sheet__computed-value">{value ?? ''}</output>
        ), {
          icon: <FunctionsIcon className="custom-sheet__tile-icon" style={{ fontSize: AFFORDANCE_ICON_SIZE }} aria-hidden="true" />,
        });
      }

      case 'progress': {
        const current = progress[field.key]?.current ?? 0;
        const max     = progress[field.key]?.max     ?? 0;
        const ratio = Number(max) > 0 ? Math.min(1, Math.max(0, Number(current) / Number(max))) : 0;
        return renderTile(field, 'progress', (
          <>
            <input
              type="number"
              className="custom-sheet__tile-input"
              value={current}
              onChange={onChange ? e => onChange.progress(field.key, 'current', e.target.value) : undefined}
              readOnly={readOnly}
              min={0}
            />
            <span className="custom-sheet__tile-sep">/</span>
            <input
              type="number"
              className="custom-sheet__tile-input custom-sheet__tile-input--max"
              value={max}
              onChange={onChange ? e => onChange.progress(field.key, 'max', e.target.value) : undefined}
              readOnly={readOnly}
              min={0}
            />
          </>
        ), {
          footer: (
            <div
              className={`custom-sheet__tile-fill${Number(max) > 0 && ratio <= 0.25 ? ' custom-sheet__tile-fill--low' : ''}`}
              style={{ width: `${ratio * 100}%` }}
            />
          ),
        });
      }

      case 'text_short':
        return renderTile(field, 'text', (
          <input
            type="text"
            className="custom-sheet__text-input"
            value={texts[field.key] || ''}
            onChange={onChange ? e => onChange.text(field.key, e.target.value) : undefined}
            readOnly={readOnly}
          />
        ));

      case 'text_long':
        return renderTile(field, 'text', (
          <textarea
            className="custom-sheet__textarea"
            value={texts[field.key] || ''}
            onChange={onChange ? e => onChange.text(field.key, e.target.value) : undefined}
            readOnly={readOnly}
            rows={3}
          />
        ));

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
        // The star joins the affordance policy the skill fields have used since FEATURE-219:
        // reserve its track when a handler exists OR the creator asked for static affordances.
        // Until now this row gated the star on the handler alone while the header reserved 22px
        // unconditionally, so in the creator every column sat 22px away from its own label.
        const showStar = !!onToggleFavorite || showAffordances;
        const showRoll = !!field.rollable && (!!onRoll || showAffordances);

        return (
          <WeaponsTable
            key={field.key}
            field={field}
            sections={sections}
            weapons={weapons}
            customSkillNodes={customSkillNodes}
            favoriteWeapons={favoriteWeapons}
            onChange={onChange}
            onRoll={onRoll}
            onToggleFavorite={onToggleFavorite}
            readOnly={readOnly}
            showStar={showStar}
            showRoll={showRoll}
            rollAffordance={rollAffordance}
            editingPath={editingPath}
            setEditingPath={setEditingPath}
            showTooltip={showTooltip}
            hideTooltip={hideTooltip}
          />
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
