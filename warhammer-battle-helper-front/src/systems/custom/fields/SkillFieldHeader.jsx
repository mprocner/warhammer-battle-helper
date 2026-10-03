import React from 'react';
import { useTranslation } from 'react-i18next';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';

// The header bar of one skill field's column — shared by skill_table and skill_tree, which is why
// it is named for neither.
//
// It renders unconditionally. In a TABLE that is load-bearing and not merely tidy: the zebra
// striping in style.css counts sibling parity, and the header is the first child of the table (or
// of each column), so a header that came and went with a field flag would flip which rows are
// tinted. A TREE has no zebra — its rows are banded by depth — so there the header is only the
// list's top edge.
//
// The CSS class is shared among all three list types (skill table, skill tree, and weapons table),
// but this component renders the header only for skill lists — the weapons table draws its own
// header markup from GM-defined labels.
//
// `gridTemplate` is handed in rather than computed here: the header and every row of the same
// field must be given the SAME string, and the moment the two compute it separately they drift.
// That is also what lets one component serve two fields whose column sets differ.
function SkillFieldHeader({
  gridTemplate,
  showDevelopment = false,
  hasAdvances = false,
  advancesLabel,
  showTooltip,
  hideTooltip,
}) {
  const { t } = useTranslation();

  return (
    <div className="custom-sheet__field-header" style={{ gridTemplateColumns: gridTemplate }}>
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

export default SkillFieldHeader;
