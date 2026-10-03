import React from 'react';
import { useTranslation } from 'react-i18next';
import LockIcon from '@mui/icons-material/Lock';
import { AFFORDANCE_ICON_SIZE } from './affordances';
import { renderDamageFormula, weaponRowIssue } from '../weaponLayout';

// One GM-owned weapon: rendered straight from the template so a GM edit reaches every player, and
// rolled by preset id so it is never copied into the character's own stats.
//
// Its cells are muted rather than tinted. The row's background now belongs to the zebra striping,
// and with borderless inputs a static cell and an editable one are otherwise identical — a player
// would discover this row is read-only by clicking it and having nothing happen. Italics were not
// available: in a skill tree they already mean "this node is mine, not the GM's", the opposite
// claim.
function WeaponsPresetRow({
  field,
  preset,
  cols,
  cellLabel,
  nameKey,
  gridTemplate,
  hasDamage,
  showStar,
  showRoll,
  renderStar,
  renderRoll,
  showTooltip,
  hideTooltip,
}) {
  const { t } = useTranslation();
  const issue = weaponRowIssue(field, preset);

  return (
    <div className="custom-sheet__weapon-row custom-sheet__weapon-row--preset" style={{ gridTemplateColumns: gridTemplate }}>
      {showStar && renderStar(preset.id)}

      {cols.map(c => {
        const label = cellLabel(c, (preset.cells && preset.cells[c.key]) || '') || '—';
        return (
          <span
            key={c.key}
            className={`custom-sheet__weapon-cell-static${c.key === nameKey ? ' custom-sheet__weapon-cell-static--name' : ''}`}
            onMouseEnter={e => {
              const el = e.currentTarget;
              if (el.scrollWidth > el.clientWidth) showTooltip(label, el);
            }}
            onMouseLeave={hideTooltip}
          >
            {label}
          </span>
        );
      })}

      {hasDamage && (
        <div className="custom-sheet__weapon-damage">
          {renderDamageFormula(field.damageFormula || [], preset, field.key, null, true, t)}
        </div>
      )}

      {showRoll && renderRoll(preset, issue)}

      <div className="custom-sheet__weapon-actions">
        <span className="custom-sheet__weapon-lock" title={t('customSheet.weaponPresetLocked')}>
          <LockIcon style={{ fontSize: AFFORDANCE_ICON_SIZE }} />
        </span>
      </div>
    </div>
  );
}

export default WeaponsPresetRow;
