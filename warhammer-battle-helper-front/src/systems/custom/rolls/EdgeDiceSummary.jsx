import React from 'react';
import { useTranslation } from 'react-i18next';

// EdgeDiceSummary is the log line for a roll made with edge/setback dice: how many, and every
// candidate with the kept one marked. The kept candidate equals data.roll — a dice template has
// no numeric modifier to shift it (the two kinds are exclusive). Ties mark the first, matching
// the server's pickIndex.
function EdgeDiceSummary({ diceMod, allRolls, roll }) {
  const { t } = useTranslation();
  if (!diceMod || !Array.isArray(allRolls) || allRolls.length < 2) return null;

  const keptIndex = allRolls.indexOf(roll);
  const kind = diceMod > 0 ? 'edge' : 'setback';
  const label = diceMod > 0
    ? t('customRoll.edgeDice', { count: diceMod })
    : t('customRoll.setbackDice', { count: -diceMod });

  return (
    <div className="custom-edge-dice">
      <span className={`custom-edge-dice__label custom-edge-dice__label--${kind}`}>{label}</span>
      {allRolls.map((r, i) => (
        <span key={i} className={`custom-edge-dice__roll${i === keptIndex ? ' custom-edge-dice__roll--kept' : ''}`}>
          {r}
        </span>
      ))}
    </div>
  );
}

export default EdgeDiceSummary;
