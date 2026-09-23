import React from 'react';
import { render, screen } from '@testing-library/react';
import '../../i18n';
import EditablePlaceholder from './EditablePlaceholder';

// The positive cases matter, but the NEGATIVE ones are the point: two earlier versions of this
// component gave a placeholder to nodes that render perfectly well, and nothing noticed because
// the component had no test at all.
describe('EditablePlaceholder — nodes that draw nothing', () => {
  test('an empty root section gets a drop invitation', () => {
    const { container } = render(<EditablePlaceholder node={{ id: 's1', title: '', columns: 3, fields: [] }} />);
    expect(container.querySelector('.creator__ph--section')).toBeInTheDocument();
  });

  test('an empty nested section gets one too', () => {
    const node = { key: 'f1', type: 'section', label: '', section: { id: 'f1', title: '', columns: 2, fields: [] } };
    const { container } = render(<EditablePlaceholder node={node} />);
    expect(container.querySelector('.creator__ph--section')).toBeInTheDocument();
  });

  test('a label with no text gets ghost text', () => {
    const { container } = render(<EditablePlaceholder node={{ key: 'l1', type: 'label', text: '' }} />);
    expect(container.querySelector('.creator__ph--inline')).toBeInTheDocument();
  });

  test('a weapons table with no columns gets a ghost row', () => {
    const { container } = render(<EditablePlaceholder node={{ key: 'w1', type: 'weapons_table', columns: [] }} />);
    expect(container.querySelector('.creator__ph--row')).toBeInTheDocument();
  });

  test('a skill table with no skills gets a ghost row', () => {
    const { container } = render(<EditablePlaceholder node={{ key: 'st1', type: 'skill_table', skills: [] }} />);
    expect(container.querySelector('.creator__ph--row')).toBeInTheDocument();
  });

  test('a skill tree with no template children gets a ghost row', () => {
    const node = { key: 'tr1', type: 'skill_tree', label: '', tree: { key: 'root', label: 'Kategoria', children: [] } };
    const { container } = render(<EditablePlaceholder node={node} />);
    expect(container.querySelector('.creator__ph--row')).toBeInTheDocument();
  });
});

describe('EditablePlaceholder — nodes that draw fine', () => {
  // makeDefaultField starts EVERY field type with label: '', so these are the states a GM is in
  // for most of a build. None of them may get a placeholder.
  test.each([
    ['attr',        { key: 'a1', type: 'attr',        label: '', abbr: '' }],
    ['number',      { key: 'n1', type: 'number',      label: '' }],
    ['checkbox',    { key: 'c1', type: 'checkbox',    label: '' }],
    ['select',      { key: 's1', type: 'select',      label: '', options: [] }],
    ['text_short',  { key: 't1', type: 'text_short',  label: '' }],
    ['text_long',   { key: 't2', type: 'text_long',   label: '' }],
    ['progress',    { key: 'p1', type: 'progress',    label: '' }],
  ])('a fresh %s field with no label gets nothing', (_type, node) => {
    const { container } = render(<EditablePlaceholder node={node} />);
    expect(container.querySelector('.creator__ph')).toBeNull();
  });

  test('a populated section gets nothing', () => {
    const node = { id: 's2', title: 'Cechy', columns: 3, fields: [{ key: 'a1', type: 'attr', label: 'WW' }] };
    const { container } = render(<EditablePlaceholder node={node} />);
    expect(container.querySelector('.creator__ph')).toBeNull();
  });

  test('a weapons table WITH columns gets nothing, even though a field definition never carries rows', () => {
    const node = { key: 'w2', type: 'weapons_table', columns: [{ key: 'name', label: 'Nazwa', type: 'text' }] };
    const { container } = render(<EditablePlaceholder node={node} />);
    expect(container.querySelector('.creator__ph')).toBeNull();
  });

  test('a label with text gets nothing', () => {
    const { container } = render(<EditablePlaceholder node={{ key: 'l2', type: 'label', text: 'Notatka' }} />);
    expect(container.querySelector('.creator__ph')).toBeNull();
  });

  test('a skill tree WITH children gets nothing', () => {
    const node = { key: 'tr2', type: 'skill_tree', label: '', tree: { key: 'root', label: 'Kategoria', children: [{ key: 'n1', label: 'Skradanie', children: [] }] } };
    const { container } = render(<EditablePlaceholder node={node} />);
    expect(container.querySelector('.creator__ph')).toBeNull();
  });
});
