import React from 'react';
import { rotatedHalfHeight } from '../../utils/tokenRingGeometry';

// Caption under a tokens-layer image — the image-token analogue of a character token's name, and
// styled by the same .token-name class so the two never drift apart. Rendered inside the upright
// (counter-rotated) box, whose size is the UNROTATED image, so the offset comes from the rotated
// image's bounding box rather than `top: 100%`.
export default function ImageTokenLabel({ label, width, height, rotation }) {
  if (!label) return null;
  const halfH = rotatedHalfHeight(width, height, rotation);
  return <span className="token-name" style={{ top: `calc(50% + ${halfH}px)` }}>{label}</span>;
}
