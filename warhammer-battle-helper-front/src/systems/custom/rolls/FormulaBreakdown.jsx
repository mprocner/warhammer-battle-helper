import React from 'react';

// Operators after which the line may wrap. Unicode line breaking (UAX #14) treats "3+5+1+6" as one
// unbreakable numeric run, so a 30d6 breakdown ("3+5+…+6 = 105") overflowed the log on one line.
const OPERATOR = /([+\-−*×/=])/;

// FormulaBreakdown renders a roll's formula line with a <wbr> after every operator: the text
// reads and copies exactly as the backend sent it, but the browser gets a legal break point
// between dice instead of none (overflow-wrap: anywhere would split a die's value in half).
function FormulaBreakdown({ text }) {
  return (
    <div className="log-formula-breakdown">
      {text.split(OPERATOR).map((piece, i) => (
        OPERATOR.test(piece)
          ? <React.Fragment key={i}>{piece}<wbr /></React.Fragment>
          : piece
      ))}
    </div>
  );
}

export default FormulaBreakdown;
