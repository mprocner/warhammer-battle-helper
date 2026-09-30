import React from 'react';
import { useTranslation } from 'react-i18next';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';

// The header bar of one skill_table column.
//
// It renders unconditionally. Two reasons, and the second is the one that bites: it is the
// table's top edge in the current skin, AND the zebra striping in style.css counts sibling
// parity from it. A header that came and went with a field flag would flip which rows are
// tinted. It must stay the FIRST child of the table (or of each column in two-column mode).
//
// `gridTemplate` is handed in rather than computed here: the header and every row of the same
// field must be given the SAME string, and the moment the two compute it separately they drift.
function SkillTableHeader({
  gridTemplate,
  showDevelopment = false,
  hasAdvances = false,
  advancesLabel,
  showTooltip,
  hideTooltip,
}) {
  const { t } = useTranslation();

  return (
    <div className="custom-sheet__skill-table-header" style={{ gridTemplateColumns: gridTemplate }}>
      {showDevelopment && (
        <span
          className="custom-sheet__skill-col-label custom-sheet__skill-col-label--dev"
          onMouseEnter={e => showTooltip(t('customSheet.development'), e.currentTarget)}
          onMouseLeave={hideTooltip}
        >
          <TrendingUpIcon style={{ fontSize: 12 }} />
        </span>
      )}
      <span className="custom-sheet__skill-col-label custom-sheet__skill-col-label--name">{t('customSheet.name')}</span>
      {hasAdvances ? (
        <>
          <span className="custom-sheet__skill-col-label custom-sheet__skill-col-label--base">{t('customSheet.base')}</span>
          <span className="custom-sheet__skill-col-label custom-sheet__skill-col-label--adv">{advancesLabel}</span>
          <span className="custom-sheet__skill-col-label custom-sheet__skill-col-label--total">{t('customSheet.total')}</span>
        </>
      ) : (
        <span className="custom-sheet__skill-col-label custom-sheet__skill-col-label--value">{t('customSheet.value')}</span>
      )}
    </div>
  );
}

export default SkillTableHeader;
