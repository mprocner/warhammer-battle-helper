import React from 'react';
import { render, screen } from '@testing-library/react';
import '../../i18n';
import CustomSheetBody from './CustomSheetBody';

const sections = [
  { id: 'sec_root', title: 'Ekwipunek', columns: 3, fields: [
    { key: 'num_gold', type: 'number', label: 'Złoto' },
    { key: 'sec_weapons', type: 'section', label: '', section: {
      id: 'sec_weapons', title: 'Broń', columns: 2, fields: [
        { key: 'txt_main', type: 'text_short', label: 'Główna' },
        { key: 'sec_ammo', type: 'section', label: '', section: {
          id: 'sec_ammo', title: 'Amunicja', columns: 1, fields: [
            { key: 'num_arrows', type: 'number', label: 'Strzały' },
          ],
        } },
      ],
    } },
  ] },
];

describe('CustomSheetBody nested sections', () => {
  test('renders headings of every nesting level', () => {
    render(<CustomSheetBody sections={sections} />);
    expect(screen.getByText('Ekwipunek')).toBeInTheDocument();
    expect(screen.getByText('Broń')).toBeInTheDocument();
    expect(screen.getByText('Amunicja')).toBeInTheDocument();
  });

  test('renders a field three levels deep, inside a nested section within a nested section', () => {
    const { container } = render(<CustomSheetBody sections={sections} />);
    expect(screen.getByText('Strzały')).toBeInTheDocument();
    // Text presence alone would pass on a flattened render. The feature's central layout
    // claim is that the nesting itself survives into the DOM, so assert the containment.
    const inner = container.querySelector(
      '.custom-sheet__section--nested .custom-sheet__section--nested'
    );
    expect(inner).toBeInTheDocument();
    expect(inner).toHaveTextContent('Amunicja');
    expect(inner).toHaveTextContent('Strzały');
  });

  test('marks nested sections with the nested modifier and leaves the root plain', () => {
    const { container } = render(<CustomSheetBody sections={sections} />);
    const root = container.querySelector('.custom-sheet__section:not(.custom-sheet__section--nested)');
    expect(root).toBeInTheDocument();
    expect(container.querySelectorAll('.custom-sheet__section--nested')).toHaveLength(2);
  });

  test('gives each nested section its own column class', () => {
    const { container } = render(<CustomSheetBody sections={sections} />);
    expect(container.querySelector('.custom-sheet__fields--3-col')).toBeInTheDocument();
    expect(container.querySelector('.custom-sheet__fields--2-col')).toBeInTheDocument();
    expect(container.querySelector('.custom-sheet__fields--1-col')).toBeInTheDocument();
  });
});
