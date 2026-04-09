import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import './DiceStats.css';

// ─── Portal Tooltip ────────────────────────────────────────────────────────────

function PortalTooltip({ top, left, text }) {
  return createPortal(
    <div className="portal-tooltip portal-tooltip--above" style={{ top, left }}>
      {text}
      <span className="portal-tooltip__arrow" />
    </div>,
    document.body
  );
}

function useTooltip() {
  const [tooltip, setTooltip] = useState(null);
  const ref = useRef(null);

  const show = (text, el) => {
    if (ref.current) clearTimeout(ref.current);
    const rect = el.getBoundingClientRect();
    const center = rect.left + rect.width / 2;
    setTooltip({ top: rect.top, left: center, text });
  };

  const hide = () => {
    ref.current = setTimeout(() => setTooltip(null), 100);
  };

  return { tooltip, show, hide };
}

// ─── DieTabStrip ──────────────────────────────────────────────────────────────

export function DieTabStrip({ dice, activeType, onSelect }) {
  if (!dice || dice.length <= 1) return null;
  return (
    <div className="die-tab-strip">
      {dice.map(d => (
        <button
          key={d.dieType}
          className={`die-tab-strip__tab${activeType === d.dieType ? ' die-tab-strip__tab--active' : ''}`}
          onClick={() => onSelect(d.dieType)}
        >
          d{d.dieType}
        </button>
      ))}
    </div>
  );
}

// ─── DieHistogram ─────────────────────────────────────────────────────────────

function getBucketLabel(idx, numBuckets, dieType) {
  const bucketSize = dieType / numBuckets;
  const from = Math.round(idx * bucketSize + 1);
  const to = Math.round((idx + 1) * bucketSize);
  return { from, to };
}

export function DieHistogram({ buckets, dieType, maxHeight = 48, showLabels = false, t }) {
  const { tooltip, show, hide } = useTooltip();

  if (!buckets || buckets.length === 0) return null;

  const maxVal = Math.max(...buckets, 1);
  const numBuckets = buckets.length;
  const isD100 = dieType === 100;

  return (
    <div>
      <div className="die-histogram" style={{ height: maxHeight }}>
        {buckets.map((count, idx) => {
          const ratio = count > 0 ? Math.max(3 / maxHeight, count / maxVal) : 0;
          const barHeight = Math.round(ratio * maxHeight);
          const isCrit = isD100 && idx === 0;
          const isFumble = isD100 && idx === numBuckets - 1;
          const { from, to } = getBucketLabel(idx, numBuckets, dieType);
          const tooltipText = t
            ? t('stats.bucket', { from, to, count })
            : `${from}–${to}: ${count}`;

          return (
            <div
              key={idx}
              className={`die-histogram__bar${isCrit ? ' die-histogram__bar--crit' : ''}${isFumble ? ' die-histogram__bar--fumble' : ''}`}
              style={{ height: barHeight }}
              onMouseEnter={e => show(tooltipText, e.currentTarget)}
              onMouseLeave={hide}
            />
          );
        })}
      </div>
      {showLabels && (
        <div className="die-histogram__labels">
          {buckets.map((_, idx) => {
            const isCrit = isD100 && idx === 0;
            const isFumble = isD100 && idx === numBuckets - 1;
            const { from, to } = getBucketLabel(idx, numBuckets, dieType);
            const label = from === to ? `${from}` : `${from}-${to}`;
            return (
              <span
                key={idx}
                className={`die-histogram__label${isCrit ? ' die-histogram__label--crit' : ''}${isFumble ? ' die-histogram__label--fumble' : ''}`}
              >
                {label}
              </span>
            );
          })}
        </div>
      )}
      {tooltip && <PortalTooltip {...tooltip} />}
    </div>
  );
}

// ─── DieStatsBlock ────────────────────────────────────────────────────────────

export function DieStatsBlock({ stats, variant = 'compact', t }) {
  if (!stats) return null;

  const isD100 = stats.dieType === 100;
  const outcomes = stats.byOutcome || {};
  const skillTotal = Object.values(outcomes).reduce((s, v) => s + v, 0);
  const successCount = Object.entries(outcomes)
    .filter(([k]) => !['failure', 'fumble'].includes(k))
    .reduce((s, [, v]) => s + v, 0);
  const successPct = skillTotal > 0 ? Math.round((successCount / skillTotal) * 100) : 0;
  const maxHeight = variant === 'expanded' ? 72 : 48;
  const showLabels = variant === 'expanded';

  return (
    <div className="die-stats-block">
      <div className="die-stats-block__tiles">
        <div className="die-stats-block__tile">
          <span className="die-stats-block__tile-value">{stats.total}</span>
          <span className="die-stats-block__tile-label">
            {t ? t('stats.totalRollsLabel') : 'Total rolls'}
          </span>
        </div>
        <div className="die-stats-block__tile">
          <span className="die-stats-block__tile-value">{stats.average?.toFixed(1) ?? '—'}</span>
          <span className="die-stats-block__tile-label">
            {t ? t('stats.averageRollLabel') : 'Average'}
          </span>
        </div>
      </div>

      <DieHistogram
        buckets={stats.buckets}
        dieType={stats.dieType}
        maxHeight={maxHeight}
        showLabels={showLabels}
        t={t}
      />

      {isD100 && skillTotal > 0 && (
        <div className="die-stats-block__tiles">
          <div className="die-stats-block__tile die-stats-block__tile--success">
            <span className="die-stats-block__tile-value">{successPct}%</span>
            <span className="die-stats-block__tile-label">
              {t ? t('stats.successRate') : 'Skill success rate'}
            </span>
          </div>
          <div className="die-stats-block__tile die-stats-block__tile--success">
            <span className="die-stats-block__tile-value">
              {t ? t('stats.successCount', { s: successCount, t: skillTotal }) : `${successCount}/${skillTotal}`}
            </span>
            <span className="die-stats-block__tile-label">
              {t ? t('stats.skillSuccessCount') : 'Successful skill rolls'}
            </span>
          </div>
        </div>
      )}

      {isD100 && (
        <div className="die-stats-block__tiles">
          <div className={`die-stats-block__tile die-stats-block__tile--crit${(stats.critCount ?? 0) === 0 ? ' die-stats-block__tile--zero' : ''}`}>
            <span className="die-stats-block__tile-value">{stats.critCount ?? 0}</span>
            <span className="die-stats-block__tile-label">
              {t ? t('stats.critLabel') : 'Crits'}
            </span>
          </div>
          <div className={`die-stats-block__tile die-stats-block__tile--fumble${(stats.fumbleCount ?? 0) === 0 ? ' die-stats-block__tile--zero' : ''}`}>
            <span className="die-stats-block__tile-value">{stats.fumbleCount ?? 0}</span>
            <span className="die-stats-block__tile-label">
              {t ? t('stats.fumbleLabel') : 'Fumbles'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
