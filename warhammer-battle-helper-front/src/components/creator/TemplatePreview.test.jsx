import React from 'react';
import { render, screen } from '@testing-library/react';
import '../../i18n';
import TemplatePreview from './TemplatePreview';

const sections = [
  { id: 'sec_a', title: 'Cechy', columns: 2, fields: [
    { key: 'attr_str', type: 'attr', label: 'Siła' },
  ] },
];

describe('TemplatePreview', () => {
  test('renders the template name and its sections', () => {
    render(<TemplatePreview sections={sections} name="Mój system" />);
    expect(screen.getByText('Mój system')).toBeInTheDocument();
    expect(screen.getByText('Cechy')).toBeInTheDocument();
  });

  test('shows the empty-state message when there are no sections', () => {
    const { container } = render(<TemplatePreview sections={[]} name="Mój system" />);
    expect(container.querySelector('.creator__prev-empty')).toBeInTheDocument();
  });

  test('renders the sheet at the width the GM configured', () => {
    const { container } = render(<TemplatePreview sections={sections} name="Mój system" width={1300} />);
    expect(container.querySelector('.creator__prev-sheet')).toHaveStyle({ maxWidth: '1300px' });
  });
});
