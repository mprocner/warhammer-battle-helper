import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import i18n from '../../i18n';
import { makeDefaultField, PropertyPanel } from './TemplateBuilder';
import EditablePlaceholder from './EditablePlaceholder';

// Importing TemplateBuilder pulls in api/axios and, through the system registry, axios itself —
// the ESM import jest cannot parse. Mocking the instance is enough to load the module.
jest.mock('axios', () => {
  const inst = { get: jest.fn(), post: jest.fn(), put: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { __esModule: true, default: { create: () => inst, ...inst } };
});

const t = i18n.t.bind(i18n);

test('a new data table starts with no columns, no presets and no roll', () => {
  const f = makeDefaultField('data_table', t);
  expect(f).toMatchObject({ type: 'data_table', label: 'Data table', columns: [], presetRows: [], rollable: false });
  expect(f.key).toMatch(/^data_table_/);
});

const renderPanel = (field) => render(
  <PropertyPanel field={field} onChange={() => {}} onDelete={() => {}} numberFields={[]} numericFields={[]} sections={[]} />
);

test('the property panel offers long text columns and preset rows, and no roll settings', () => {
  const field = {
    ...makeDefaultField('data_table', t),
    columns: [{ key: 'c1', label: 'Nazwa', type: 'text', options: [], optionsFromSkills: false }],
  };
  renderPanel(field);
  expect(screen.getByRole('option', { name: 'Long text' })).toBeInTheDocument();
  expect(screen.getByText('Preset rows')).toBeInTheDocument();
  expect(screen.queryByText('Attack roll')).not.toBeInTheDocument();
  expect(screen.queryByText('Options from skills')).not.toBeInTheDocument();
});

test('a data table without columns shows the row placeholder in the creator', () => {
  const { container } = render(<EditablePlaceholder node={{ key: 'd', type: 'data_table', columns: [] }} />);
  expect(container.querySelector('.creator__ph--row')).not.toBeNull();
});

// The display group is what a GM tunes most after the columns themselves, so it opens the panel.
test('the display group comes first in the property panel', () => {
  const { container } = renderPanel(makeDefaultField('data_table', t));
  // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
  const titles = Array.from(container.querySelectorAll('.creator__props-group-title')).map(el => el.textContent);
  expect(titles[0]).toBe('Display');
});

describe('sorting a data table', () => {
  const columns = [
    { key: 'qty',  label: 'Ilość', type: 'number',    options: [], optionsFromSkills: false },
    { key: 'name', label: 'Nazwa', type: 'text',      options: [], optionsFromSkills: false },
    { key: 'kind', label: 'Rodzaj', type: 'text',     options: [], optionsFromSkills: false },
    { key: 'desc', label: 'Opis',  type: 'long_text', options: [], optionsFromSkills: false },
  ];

  test('offers no column picker until sorting is on', () => {
    renderPanel({ ...makeDefaultField('data_table', t), columns });
    expect(screen.queryByLabelText('Sort by column')).not.toBeInTheDocument();
  });

  test('lists only short text columns once sorting is on', () => {
    const onChange = jest.fn();
    render(
      <PropertyPanel
        field={{ ...makeDefaultField('data_table', t), columns, sortAlphabetically: true }}
        onChange={onChange} onDelete={() => {}} numberFields={[]} numericFields={[]} sections={[]}
      />
    );
    const picker = screen.getByLabelText('Sort by column');
    // eslint-disable-next-line testing-library/no-node-access
    expect(Array.from(picker.options).map(o => o.textContent)).toEqual(['Nazwa', 'Rodzaj']);
    expect(picker.value).toBe('name');
    fireEvent.change(picker, { target: { value: 'kind' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ sortColumn: 'kind' }));
  });

  test('explains why there is nothing to pick when no column is short text', () => {
    renderPanel({ ...makeDefaultField('data_table', t), columns: [columns[0]], sortAlphabetically: true });
    expect(screen.getByText('Add a short text column to sort by.')).toBeInTheDocument();
  });
});
