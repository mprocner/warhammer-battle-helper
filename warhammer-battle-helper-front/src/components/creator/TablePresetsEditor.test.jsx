import React from 'react';
import { render, screen } from '@testing-library/react';
import i18n from '../../i18n';
import TablePresetsEditor from './TablePresetsEditor';

const columns = [{ key: 'c1', label: 'Name', type: 'text', options: [], optionsFromSkills: false }];
const presets = [
  { id: 'preset_a', cells: { c1: 'Sword' }, alwaysOn: false },
  { id: 'preset_b', cells: { c1: 'Axe' }, alwaysOn: true },
];
const labels = { title: 'Presets', hint: 'Hint', noColumns: 'No columns', add: 'Add' };

const renderEditor = (props = {}) =>
  render(<TablePresetsEditor columns={columns} presets={presets} onChange={() => {}} labels={labels} {...props} />);

test('every preset has a numbered drag handle', () => {
  renderEditor();
  expect(screen.getByLabelText(i18n.t('creator.tablePresetReorder', { n: 1 }))).toBeInTheDocument();
  expect(screen.getByLabelText(i18n.t('creator.tablePresetReorder', { n: 2 }))).toBeInTheDocument();
});

test('the sorted-on-sheet hint shows only when the sheet sorts', () => {
  const { unmount } = renderEditor();
  expect(screen.queryByText(i18n.t('creator.presetReorderSortedHint'))).not.toBeInTheDocument();
  unmount();
  renderEditor({ sortedOnSheet: true });
  expect(screen.getByText(i18n.t('creator.presetReorderSortedHint'))).toBeInTheDocument();
});
