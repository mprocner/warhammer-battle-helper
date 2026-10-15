import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import i18n from '../../i18n';
import AttrRowsEditor from './AttrRowsEditor';

const rows = [{ id: 'attr_ws', label: 'Walka wręcz', abbr: 'WW', default: 31, min: 0, max: 100 }];

const setup = (list = rows) => {
  const onChange = jest.fn();
  render(<AttrRowsEditor rows={list} onChange={onChange} />);
  return onChange;
};

const lbl = (colKey, row = 'Walka wręcz') => `${i18n.t(colKey)} – ${row}`;

test('adds a row with a fresh attr id and a numbered default label', () => {
  const onChange = setup();
  fireEvent.click(screen.getByText(i18n.t('creator.attrRowsAdd')));
  const next = onChange.mock.calls[0][0];
  expect(next).toHaveLength(2);
  expect(next[1].id).toMatch(/^attr_/);
  expect(next[1].id).not.toContain('.');
  expect(next[1].label).toBe(i18n.t('creator.attrRowsNewLabel', { n: 2 }));
});

test('removes a row', () => {
  const onChange = setup();
  fireEvent.click(screen.getByLabelText(i18n.t('creator.attrRowsDelete')));
  expect(onChange).toHaveBeenCalledWith([]);
});

test('edits the label', () => {
  const onChange = setup();
  fireEvent.change(screen.getByLabelText(lbl('creator.attrRowsColName')), { target: { value: 'WS' } });
  expect(onChange.mock.calls[0][0][0]).toMatchObject({ id: 'attr_ws', label: 'WS' });
});

test('edits text fields', () => {
  const onChange = setup();
  fireEvent.change(screen.getByLabelText(lbl('creator.attrRowsColAbbr')), { target: { value: 'WS' } });
  expect(onChange.mock.calls[0][0][0]).toMatchObject({ id: 'attr_ws', abbr: 'WS' });
});

test('truncates numbers and clears to null', () => {
  const onChange = setup();
  fireEvent.change(screen.getByLabelText(lbl('creator.attrRowsColDefault')), { target: { value: '2.7' } });
  expect(onChange.mock.calls[0][0][0].default).toBe(2);
  fireEvent.change(screen.getByLabelText(lbl('creator.attrRowsColMax')), { target: { value: '' } });
  expect(onChange.mock.calls[1][0][0].max).toBeNull();
});

test('toggles the short-card flag', () => {
  const onChange = setup();
  fireEvent.click(screen.getByLabelText(lbl('creator.attrRowsColShortCard')));
  expect(onChange.mock.calls[0][0][0].showOnShortCard).toBe(true);
});

test('editing row 2 leaves row 1 untouched', () => {
  const two = [...rows, { id: 'attr_s', label: 'Siła', abbr: 'S', default: 30 }];
  const onChange = setup(two);
  fireEvent.change(screen.getByLabelText(lbl('creator.attrRowsColAbbr', 'Siła')), { target: { value: 'ST' } });
  const next = onChange.mock.calls[0][0];
  expect(next[0]).toEqual(two[0]);
  expect(next[1]).toMatchObject({ id: 'attr_s', abbr: 'ST' });
});

test('shows the empty hint with no rows', () => {
  setup([]);
  expect(screen.getByText(i18n.t('creator.attrRowsEmpty'))).toBeTruthy();
});

test('every row has a labelled drag handle', () => {
  setup([...rows, { id: 'attr_s', label: 'Siła' }]);
  expect(screen.getByLabelText(`${i18n.t('creator.attrRowsReorder')} – Walka wręcz`)).toBeTruthy();
  expect(screen.getByLabelText(`${i18n.t('creator.attrRowsReorder')} – Siła`)).toBeTruthy();
});
