import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { attrsPerBand, splitBands, ATTR_TABLE_LABEL_COL_PX } from '../attrTableBands';
import NumberInput from '../../../components/common/NumberInput';

// The attr_table field (PLAYRPG-235): attributes as columns, Warhammer style, with the rows
// Base / Advances / Total (or a single Value row without advances) and a die row when rollable.
// Each row of the template's attrRows is a full attribute stored in attrs[row.id], so editing
// goes through the same onChange.attr / onChange.advances an attr field uses.
//
// The width is measured to split the columns into bands, each repeating the row-label column
// (see attrTableBands.js). Without ResizeObserver (jsdom) the table stays one band.
function AttrTable({ field, attrs, onChange, readOnly, showRoll, renderRoll, showTooltip, hideTooltip }) {
  const { t } = useTranslation();
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const rows = field.attrRows || [];
  const hasAdv = !!field.hasAdvances;
  const step = field.step || 1;
  const advancesLabel = field.advancesLabel || t('customSheet.advancesShort');
  const bands = splitBands(rows, attrsPerBand(width));

  const input = (row, kind) => {
    const v = attrs[row.id] || {};
    const isAdv = kind === 'advances';
    // Mirrors the attr field: with advances an empty part shows blank instead of 0; a solo value
    // shows the stored base as-is so a real 0 stays visible.
    const value = hasAdv ? ((isAdv ? v.advances : v.base) || '') : (v.base ?? '');
    return (
      <NumberInput
        key={`${row.id}-${kind}`}
        className={`custom-sheet__attr-table-input${isAdv ? ' custom-sheet__attr-table-input--adv' : ''}`}
        value={value}
        onChange={onChange ? e => onChange[isAdv ? 'advances' : 'attr'](row.id, e.target.value) : undefined}
        readOnly={readOnly}
        min={isAdv ? undefined : (row.min ?? undefined)}
        max={isAdv ? undefined : (row.max ?? undefined)}
        step={step}
        aria-label={isAdv ? `${row.label} – ${advancesLabel}` : (hasAdv ? `${row.label} – ${t('customSheet.baseShort')}` : row.label)}
      />
    );
  };

  const rowLabel = (text) => <span className="custom-sheet__attr-table-rowlabel">{text}</span>;

  // The ref'd wrapper is always rendered, so the observer attaches even when the table starts empty.
  return (
    <div className="custom-sheet__attr-table" ref={wrapRef}>
      {rows.length === 0 && (
        <div className="custom-sheet__attr-table-empty">{t('customSheet.attrTableEmpty')}</div>
      )}
      {bands.map((band, i) => (
        <div
          key={i}
          className="custom-sheet__attr-table-band"
          style={{ gridTemplateColumns: `${ATTR_TABLE_LABEL_COL_PX}px repeat(${band.length}, minmax(0, 1fr))` }}
        >
          <span className="custom-sheet__attr-table-corner" />
          {band.map(row => (
            <span
              key={row.id}
              className="custom-sheet__attr-table-head"
              onMouseEnter={e => showTooltip(row.label, e.currentTarget)}
              onMouseLeave={hideTooltip}
            >
              {row.abbr || row.label}
            </span>
          ))}

          {hasAdv ? (
            <>
              {rowLabel(t('customSheet.baseShort'))}
              {band.map(row => input(row, 'base'))}
              {rowLabel(advancesLabel)}
              {band.map(row => input(row, 'advances'))}
              {rowLabel(t('customSheet.total'))}
              {band.map(row => {
                const v = attrs[row.id] || {};
                return (
                  <output key={row.id} className="custom-sheet__attr-table-total">
                    {v.current ?? ((v.base ?? 0) + (v.advances ?? 0))}
                  </output>
                );
              })}
            </>
          ) : (
            <>
              {rowLabel(t('customSheet.value'))}
              {band.map(row => input(row, 'base'))}
            </>
          )}

          {showRoll && (
            <>
              {/* Empty cell keeps the die row aligned under the row-label column. */}
              <span />
              {band.map(row => (
                <span key={row.id} className="custom-sheet__attr-table-roll">{renderRoll(row)}</span>
              ))}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

export default AttrTable;
