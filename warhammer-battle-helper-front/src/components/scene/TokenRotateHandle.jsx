import React from 'react';
import RotateRightIcon from '@mui/icons-material/RotateRight';
import { useTranslation } from 'react-i18next';
import { tokenRingGeometry, EQUATOR_STACK_STEP } from '../../utils/tokenRingGeometry';

// Shared rotate chrome used by BOTH token kinds (character + image). It lives in the right-equator
// action column, two steps below the kill toggle (y = 0) and the eye (y = 1 step).
//
// It used to sit on a stem above the token's north edge, which collided with ring slot 0 at EVERY
// token size, not just small ones (BUG-194): the old box (top: -26px, height 18px) put its centre
// 17px above the token edge, and RING_MARGIN puts slot 0 at exactly the same 17px. halfLong
// cancels out of both, so the overlap was pixel-exact from a 1x1 token to a 3x3 one.
//
// The anchor is inset:0 with rotate(-counterRotate): its origin is the host container's centre, so
// the rotation exactly undoes the host's own — the same trick as .scene-image__upright. This
// matters only for image tokens, whose whole container rotates while the ring is counter-rotated;
// without it the handle orbits the ring and falls into each slot in turn. Character tokens rotate
// only their avatar and pass 0.
export default function TokenRotateHandle({ onRotateStart, width, height, counterRotate = 0 }) {
  const { t } = useTranslation();
  const { equatorX } = tokenRingGeometry(width, height, true);
  return (
    <div className="token-rotate-anchor" style={{ transform: `rotate(${-counterRotate}deg)` }}>
      <div
        className="token-rotate-toggle"
        style={{
          left: '50%',
          top: '50%',
          transform: `translate(calc(-50% + ${equatorX}px), calc(-50% + ${EQUATOR_STACK_STEP * 2}px))`,
        }}
        onMouseDown={onRotateStart}
        title={t('scenes.rotateToken')}
      >
        <RotateRightIcon style={{ fontSize: 14 }} />
      </div>
    </div>
  );
}
