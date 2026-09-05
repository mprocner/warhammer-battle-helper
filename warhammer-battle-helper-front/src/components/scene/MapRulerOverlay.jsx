import React from 'react';
import { CELL_SIZE } from '../../constants/scene';
import { formatDistance } from '../../utils/tokenGeometry';
import './MapRulerOverlay.css';

// Presentational overlay for measuring rulers — the local one plus every other player's,
// all ephemeral. Coordinates are in canvas pixels (col/row * CELL_SIZE); the parent already
// lives in scene space (zoom is applied by an ancestor transform).
//
// zIndex is a prop because the stack is split (FEATURE-135): other players' rulers render BELOW
// FogLayer (30) so a token moved under fog does not leak its path, while the local ruler stays on
// top so measuring toward a fogged area still shows you your own line and readout.
//
// `clip` confines everything this overlay draws to the canvas rect, making it exactly congruent
// with FogLayer's canvas — set it on the under-fog instance. Without it the fog cannot hide the
// distance badge near the map edges: the badge is translated ~28px ABOVE its midpoint
// (MapRulerOverlay.css), and the SVG is overflow:visible, so a ruler in the top row paints its
// readout on the frame above the map where no fog exists. Same for the left/right overhang and for
// any geometry that lands outside the grid.
export default function MapRulerOverlay({ rulers, cellDistance = 1, unit = '', canvasWidth, canvasHeight, zIndex = 40, clip = false }) {
  if (!rulers.length) return null;
  return (
    <div
      className="map-ruler-overlay"
      style={{ position: 'absolute', top: 0, left: 0, width: canvasWidth, height: canvasHeight, pointerEvents: 'none', zIndex, overflow: clip ? 'hidden' : 'visible' }}
    >
      <svg width={canvasWidth} height={canvasHeight} style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}>
        {rulers.map(r => {
          const x1 = r.from.col * CELL_SIZE, y1 = r.from.row * CELL_SIZE;
          const x2 = r.to.col * CELL_SIZE, y2 = r.to.row * CELL_SIZE;
          const color = r.color || '#ffffff';
          // AoE circle radius = the actual pixel distance to the endpoint, so the circle always
          // passes through where you dragged, regardless of the distance metric.
          const radius = Math.hypot(x2 - x1, y2 - y1);
          // Arrowhead at the endpoint — players use the ruler as a pointer.
          const ang = Math.atan2(y2 - y1, x2 - x1);
          const AH = 13, AW = 7; // arrowhead length + half-width
          const bx = x2 - AH * Math.cos(ang), by = y2 - AH * Math.sin(ang);
          const ax1 = bx - AW * Math.sin(ang), ay1 = by + AW * Math.cos(ang);
          const ax2 = bx + AW * Math.sin(ang), ay2 = by - AW * Math.cos(ang);
          return (
            <g key={r.key}>
              {/* AoE circle — spell templates / grenade throws. Only the manual ruler tool sets r.aoe. */}
              {r.aoe && (
                <circle cx={x1} cy={y1} r={radius} fill={color} fillOpacity="0.15" stroke={color} strokeOpacity="0.5" strokeWidth="1.5" />
              )}
              {/* dark halo for contrast on any map, then the coloured dashed line */}
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#000" strokeWidth="4" strokeLinecap="round" opacity="0.4" />
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="2" strokeDasharray="6 5" strokeLinecap="round" />
              <circle cx={x1} cy={y1} r="4" fill={color} stroke="#000" strokeWidth="1" />
              {radius > 2 && (
                <polygon points={`${x2},${y2} ${ax1},${ay1} ${ax2},${ay2}`} fill={color} stroke="#000" strokeWidth="0.5" />
              )}
            </g>
          );
        })}
      </svg>
      {rulers.map(r => {
        const mx = ((r.from.col + r.to.col) / 2) * CELL_SIZE;
        const my = ((r.from.row + r.to.row) / 2) * CELL_SIZE;
        return (
          <div key={r.key} className="map-ruler-badge" style={{ left: mx, top: my }}>
            {formatDistance(r.distance, cellDistance, unit)}
            {r.name ? <span className="map-ruler-badge__name"> · {r.name}</span> : null}
          </div>
        );
      })}
    </div>
  );
}
