import React from 'react';
import { render } from '@testing-library/react';
import { TokenHpBar } from './TokenRingChrome';

test('valuesHidden suppresses the numeric text but keeps the fill width', () => {
  const { container } = render(
    <div>
      <TokenHpBar current={0} max={0} pct={60} tone="good" canEdit={false} onStep={() => {}} valuesHidden />
    </div>
  );
  expect(container.querySelector('.token-hp__text')).toBeNull();
  expect(container.querySelector('.token-hp__fill').style.width).toBe('60%');
});

test('shows the numeric text when valuesHidden is not set', () => {
  const { container } = render(
    <div>
      <TokenHpBar current={6} max={10} pct={60} tone="good" canEdit={false} onStep={() => {}} />
    </div>
  );
  expect(container.querySelector('.token-hp__text').textContent).toBe('6 / 10');
});

test('valuesHidden hides the step buttons even when canEdit is true', () => {
  const { container } = render(
    <div>
      <TokenHpBar current={0} max={0} pct={20} tone="danger" canEdit={true} onStep={() => {}} valuesHidden />
    </div>
  );
  expect(container.querySelector('.token-hp__btn')).toBeNull();
});
