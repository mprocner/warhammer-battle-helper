import React, { useEffect, useState, useRef } from 'react';
import LockIcon from '@mui/icons-material/Lock';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';

const FACE_DOTS = {
  1: [[50, 50]],
  2: [[25, 25], [75, 75]],
  3: [[25, 25], [50, 50], [75, 75]],
  4: [[25, 25], [75, 25], [25, 75], [75, 75]],
  5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
  6: [[25, 20], [75, 20], [25, 50], [75, 50], [25, 80], [75, 80]],
};

function YahtzeeDie({ value, held, isRolling, canHold, onToggleHold }) {
  const [displayValue, setDisplayValue] = useState(value || 1);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (isRolling) {
      intervalRef.current = setInterval(() => {
        setDisplayValue(Math.floor(Math.random() * 6) + 1);
      }, 80);
    } else {
      clearInterval(intervalRef.current);
      if (value) setDisplayValue(value);
    }
    return () => clearInterval(intervalRef.current);
  }, [isRolling, value]);

  if (value === 0) {
    return (
      <div className="yahtzee-die yahtzee-die--hidden">
        <VisibilityOffIcon className="yahtzee-die__hidden-icon" />
      </div>
    );
  }

  const dots = FACE_DOTS[displayValue] || FACE_DOTS[1];

  return (
    <div
      className={`yahtzee-die ${held ? 'yahtzee-die--held' : ''} ${isRolling ? 'yahtzee-die--rolling' : ''} ${canHold ? 'yahtzee-die--holdable' : ''}`}
      onClick={canHold ? onToggleHold : undefined}
      title={canHold ? (held ? 'Unhold' : 'Hold') : undefined}
    >
      <svg viewBox="0 0 100 100" className="yahtzee-die__face">
        {dots.map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={9} className="yahtzee-die__dot" />
        ))}
      </svg>
      {held && <LockIcon className="yahtzee-die__lock-icon" />}
    </div>
  );
}

export default YahtzeeDie;
