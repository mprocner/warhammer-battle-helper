/* eslint-disable testing-library/no-node-access, testing-library/prefer-presence-queries -- blocks are asserted by BEM class; trackComputed presence is checked via queryBy next to the null checks */
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import i18n from '../../i18n';
import FormulaBuilder from './FormulaBuilder';

const attrs = [{ key: 'str', label: 'Strength', abbr: 'STR' }];
const nums = [{ key: 'load', label: 'Load' }];

const setup = (props = {}) => {
  const onChange = jest.fn();
  const utils = render(
    <FormulaBuilder formula={[]} onChange={onChange} numberFields={attrs} numericFields={nums} {...props} />
  );
  return { onChange, ...utils };
};

test('parenthesis buttons add paren blocks', () => {
  const { getByText, onChange } = setup();
  fireEvent.click(getByText('('));
  expect(onChange.mock.calls[0][0][0]).toMatchObject({ type: 'paren_open' });
  fireEvent.click(getByText(')'));
  expect(onChange.mock.calls[1][0][0]).toMatchObject({ type: 'paren_close' });
});

test('a number-field chip adds a number block', () => {
  const { getByText, onChange } = setup();
  fireEvent.click(getByText('Load'));
  expect(onChange.mock.calls[0][0][0]).toMatchObject({ type: 'number', key: 'load', label: 'Load' });
});

test('arithmetic-only mode offers no dice, no pool operator and no skill tokens', () => {
  const { queryByText } = setup({ arithmeticOnly: true });
  expect(queryByText(i18n.t('creator.formula.sectionDice'))).toBeNull();
  expect(queryByText('d')).toBeNull();
  expect(queryByText(i18n.t('creator.formula.skillValueBtn'))).toBeNull();
  expect(queryByText(i18n.t('creator.formula.trackComputed'))).not.toBeNull();
});

test('the block the parser stopped at is highlighted', () => {
  const formula = [{ id: 'a', type: 'paren_open' }, { id: 'b', type: 'paren_close' }];
  const { container } = setup({ formula });
  const blocks = container.querySelectorAll('.fb__block');
  expect(blocks[0]).not.toHaveClass('fb__block--error');
  expect(blocks[1]).toHaveClass('fb__block--error');
  // The preview line is "⚠ <message>" in one element, so match by containment, not getByText.
  expect(container.querySelector('.fb__track-preview').textContent)
    .toContain(i18n.t('creator.formula.error.unexpected_block'));
});

test('a valid formula shows its notation with parentheses', () => {
  const formula = [
    { id: 'a', type: 'paren_open' }, { id: 'b', type: 'attr', key: 'str', label: 'STR' },
    { id: 'c', type: 'op', value: '+' }, { id: 'd', type: 'const', num: 2 }, { id: 'e', type: 'paren_close' },
  ];
  const { container } = setup({ formula });
  expect(container.querySelector('.fb__track-preview em').textContent).toBe('(STR + 2)');
});
