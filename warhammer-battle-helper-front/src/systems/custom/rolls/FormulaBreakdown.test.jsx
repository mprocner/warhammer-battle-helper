import React from 'react';
import { render } from '@testing-library/react';
import FormulaBreakdown from './FormulaBreakdown';

describe('FormulaBreakdown', () => {
  it('keeps the text verbatim and adds a break point after every operator', () => {
    const text = 'WWd6 = 3+5+1+6 = 15';
    const { container } = render(<FormulaBreakdown text={text} />);
    const line = container.querySelector('.log-formula-breakdown');
    expect(line.textContent).toBe(text);
    // Five operators: two "=" and three "+".
    expect(line.querySelectorAll('wbr')).toHaveLength(5);
  });

  it('adds no break point to a line without operators', () => {
    const { container } = render(<FormulaBreakdown text="WW" />);
    expect(container.querySelectorAll('wbr')).toHaveLength(0);
  });
});
