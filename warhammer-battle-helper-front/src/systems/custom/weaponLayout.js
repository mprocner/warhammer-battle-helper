// Weapons-table helpers: the completeness verdict for a row, the name a roll is logged under, which
// column asks for skills, and the damage formula's rendering. The table's geometry and generic
// labels live in rowTableLayout.js, shared with data_table. collectSkillOptions — the
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
import { rowLabel } from './rowTableLayout';
import { isValidDamageExpr } from './formula/damageExpr';

const DMG_OP_SYMBOL = { '+': '+', '-': '−', '*': '×', '/': '÷' };

// weaponRowLabel is the name a weapon is logged and listed under: rowLabel over the weapon's
// columns, falling back to the field label and then to the generic "Weapon".
export function weaponRowLabel(field, row, t) {
  return rowLabel(field.columns, row, field.label || t('customSheet.weapon'));
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

// isValidDieFaces: digits only, positive — the same set Go's strconv.Atoi accepts ("6.0" and "1e1"
// pass Number() but not the backend).
const isValidDieFaces = v => /^\d+$/.test(String(v).trim()) && Number(v) > 0;

// weaponDamageIssue reports what is wrong with a row's player-filled damage blocks: 'damage' when
// any is empty, 'damageInvalid' when all are filled but one is unusable, null when the row can
// roll. Empty wins: it is the gap the player most likely still means to fill. A die's faces must
// be a positive integer; a ▢ (const_input) takes a number or dice in the damageExpr grammar.
// GM-fixed blocks and backend-resolved tokens are always complete.
function weaponDamageIssue(blocks, row) {
  const dmg = row.damage || {};
  let invalid = false;
  for (const b of (blocks || [])) {
    if (b.type !== 'const_input' && !isPlayerDie(b)) continue;
    const v = dmg[b.id];
    if (v == null || String(v).trim() === '') return 'damage';
    if (b.type === 'const_input' ? !isValidDamageExpr(v) : !isValidDieFaces(v)) {
      invalid = true;
    }
  }
  return invalid ? 'damageInvalid' : null;
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
// empty skill would silently contribute 0 to damage the player believes is complete. Damage
// reports 'damage' (something empty) or 'damageInvalid' (filled, but not a usable expression).
export function weaponRowIssue(field, row) {
  const skillCol = weaponSkillColumn(field);
  if (skillCol && !(row.cells || {})[skillCol.key]) return 'skill';
  return weaponDamageIssue(field.damageFormula || [], row);
}

// weaponIssueTitle maps an issue to its tooltip. Written as literal t() calls rather than a
// built key ("customSheet.weaponIssue." + issue) so that grepping a key name still finds
// where it is used.
export function weaponIssueTitle(issue, t) {
  if (issue === 'skill')  return t('customSheet.weaponSkillMissing');
  if (issue === 'damage') return t('customSheet.weaponDamageIncomplete');
  if (issue === 'damageInvalid') return t('customSheet.weaponDamageInvalid');
  return undefined;
}

// renderDamageFormula renders a weapon's damage skeleton inline. Player-filled blocks (a die's
// faces, the ▢ expression) become inputs bound to row.damage[block.id]; GM constants and dice,
// attribute and skill tokens are static — the backend resolves tokens from stats at roll time.
// tooltip ({ show, hide } from usePortalTooltip) adds the ▢ examples on hover while editing.
export function renderDamageFormula(blocks, row, fieldKey, onChange, readOnly, t, tooltip = null) {
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
        // Player-filled number or dice per weapon; empty or invalid blocks the roll.
        const cv = dmg[b.id] ?? '';
        const invalid = cv !== '' && !isValidDamageExpr(cv);
        const hint = (
          <>
            {invalid && <span className="custom-sheet__weapon-dmg-hint-error">{t('customSheet.damageExprInvalid')}</span>}
            {t('customSheet.damageExprHint')}
          </>
        );
        const hover = tooltip && !readOnly;
        return (
          <input
            key={b.id}
            type="text"
            className={`custom-sheet__weapon-dmg-input custom-sheet__weapon-dmg-input--expr${cv === '' || invalid ? ' custom-sheet__weapon-dmg-input--missing' : ''}`}
            value={cv}
            placeholder="?"
            onChange={onChange ? e => onDmg(b.id, e.target.value) : undefined}
            onMouseEnter={hover ? e => tooltip.show(hint, e.currentTarget) : undefined}
            onMouseLeave={hover ? tooltip.hide : undefined}
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
              className={`custom-sheet__weapon-dmg-input${v === '' || !isValidDieFaces(v) ? ' custom-sheet__weapon-dmg-input--missing' : ''}`}
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
