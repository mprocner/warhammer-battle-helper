/* eslint-disable testing-library/no-node-access, testing-library/no-container */
import React from 'react';
import { render } from '@testing-library/react';
import '../../i18n';
import CustomSheetBody from './CustomSheetBody';

const op = (v) => ({ type: 'op', value: v });
const attr = (key) => ({ type: 'attr', key, label: key });

const sectionsWith = (computed) => [{
  id: 's', title: '', columns: 3, fields: [
    { key: 'str', type: 'attr', label: 'STR' },
    { key: 'load', type: 'number', label: 'Load' },
    { key: 'hp', type: 'computed', label: 'HP', ...computed },
  ],
}];

const valueOf = (container) => container.querySelector('.custom-sheet__computed-value');

test('shows the formula value from the live character values, read-only', () => {
  const sections = sectionsWith({ formula: [attr('str'), op('*'), { type: 'const', num: 2 }, op('+'), { type: 'number', key: 'load' }], default: null });
  const { container } = render(
    <CustomSheetBody sections={sections} values={{ attributes: { str: { current: 25 } }, numbers: { load: 10 } }} />
  );
  expect(valueOf(container).textContent).toBe('60');
  expect(valueOf(container).tagName).toBe('OUTPUT');
  expect(container.querySelector('.custom-sheet__tile--computed')).not.toBeNull();
  expect(container.querySelector('.custom-sheet__tile--computed input')).toBeNull();
});

test('shows the default when the formula names a removed field', () => {
  const sections = sectionsWith({ formula: [attr('str'), op('+'), attr('bonus')], default: 5 });
  const { container } = render(<CustomSheetBody sections={sections} values={{ attributes: { str: { current: 40 } } }} />);
  expect(valueOf(container).textContent).toBe('5');
});

test('is empty when the formula fails and there is no default', () => {
  const sections = sectionsWith({ formula: [], default: null });
  const { container } = render(<CustomSheetBody sections={sections} />);
  expect(valueOf(container).textContent).toBe('');
});
