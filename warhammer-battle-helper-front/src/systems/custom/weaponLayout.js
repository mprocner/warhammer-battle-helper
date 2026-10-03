// Weapons-table helpers: the completeness verdict for a row, the name a roll is logged under,
// which column asks for skills, and the damage formula's rendering. collectSkillOptions — the
// actual skill enumeration a "from skills" column offers — moved to skillLayout.js: it is skill-key
// composition, not a weapons concern, and weaponSkillColumn here only answers which column wants it.
//
// They live beside skillLayout.js rather than inside it because a weapons table is not a skill,
// and a module named for one must not be the home of the other. They left CustomSheetBody because
// three other files import them — the creator, the short character card and a test — so that file
// was the home of weapons logic long after it stopped being the only place weapons are rendered.
//
// Unlike skillLayout.js this module is not purely arithmetic: renderDamageFormula returns JSX.
// That is deliberate. The alternative was a fourth module holding one function, splitting things
// that always change together.

import React from 'react';

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

// diceFaces returns a dice block's fixed face count (e.g. 10 for "d10"), or null when the
// block is a "generic" die ("d" with no number) that the player fills in per weapon.
function diceFaces(b) {
  const n = Number(String(b.value || '').replace(/^d/, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// isPlayerDie reports whether a dice block is filled by the player on the sheet (generic die)
// rather than fixed by the GM. Only player dice are editable and validated before a roll.
function isPlayerDie(b) {
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

// weaponGridTemplate builds ONE grid-template-columns string for a weapons_table. The header and
// every row of the field must be handed the same string; until FEATURE-224 they were two flex
// rows that happened to hold the same number of flex: 1 children, which nothing enforced while
// the columns themselves are defined by the GM.
//
// A column's track comes from its TYPE, never from its content. auto and max-content would make
// the width depend on the data, so a column would grow while the player types into it and shove
// its neighbours sideways under the cursor.
//
// The name column — the one that gets what is left over — is the first column of type text,
// which is exactly the column weaponRowLabel already treats as the weapon's name. One definition
// of "the name", not two that can drift. Note: weaponRowLabel searches each row for the first
// non-empty text cell (content-aware), while this template must be content-blind — a single string
// shared by header and all rows — so it picks the column by schema order alone.
//
// minmax(0, …) on every flexible track: without the zero floor a track refuses to shrink below
// its content, which is the very behaviour this function exists to avoid.
//
// The die's track is separate from the actions track because the actions cell is about to hold
// two player buttons in edit mode, and a die wedged between them would leave no room for either
// one in the 52px the actions cell has for three controls.
export function weaponGridTemplate(field, { showStar = false, showRoll = false, showActions = false, hasDamage = false } = {}) {
  const columns = field.columns || [];
  const nameKey = (columns.find(c => c.type === 'text') || {}).key;

  const trackFor = (c) => {
    if (c.type === 'number') return '56px';
    if (c.type === 'select') return 'minmax(0, 140px)';
    return c.key === nameKey ? 'minmax(0, 2fr)' : 'minmax(0, 1fr)';
  };

  return [
    showStar && '22px',
    ...columns.map(trackFor),
    hasDamage && 'minmax(0, 1fr)',
    showRoll && '28px',
    showActions && '52px',
  ].filter(Boolean).join(' ');
}
