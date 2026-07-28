import React from 'react';
import RotateRightIcon from '@mui/icons-material/RotateRight';
import { useTranslation } from 'react-i18next';

// Shared rotate chrome used by BOTH token kinds (character + image), sitting above the token so it
// never overlaps the 8 resize handles. Mirrors TokenResizeHandles: this renders the affordance and
// reports the grab; the angle math lives in useTokenRotate.
export default function TokenRotateHandle({ onRotateStart }) {
  const { t } = useTranslation();
  return (
    <div
      className="token-rotate-handle"
      onMouseDown={onRotateStart}
      title={t('scenes.rotateToken')}
    >
      <RotateRightIcon style={{ fontSize: 14 }} />
    </div>
  );
}
