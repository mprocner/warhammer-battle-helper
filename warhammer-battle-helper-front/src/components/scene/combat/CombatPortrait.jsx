import React from 'react';
import BoltIcon from '@mui/icons-material/Bolt';
import CloseIcon from '@mui/icons-material/Close';
import { resolveFileUrl } from '../../../utils/fileUrl';

// One participant's face: avatar or image, a bolt for a manual entry, the initial as fallback.
// A dead participant gets the same red cross as its token.
export default function CombatPortrait({ entry, small = false }) {
  const cls = `combat-portrait${small ? ' combat-portrait--small' : ''}`;
  let face;
  if (entry.kind === 'manual') {
    face = <span className={`${cls} combat-portrait--manual`}><BoltIcon style={{ fontSize: small ? 12 : 16 }} /></span>;
  } else if (entry.avatar) {
    face = <img className={cls} src={resolveFileUrl(entry.avatar)} alt="" draggable={false} />;
  } else {
    face = <span className={`${cls} combat-portrait--initial`}>{(entry.name || '?').charAt(0)}</span>;
  }
  return (
    <span className="combat-portrait__wrap">
      {face}
      {entry.killed && <CloseIcon className="combat-portrait__killed" />}
    </span>
  );
}
