import React from 'react';
import { render, screen } from '@testing-library/react';
import '../i18n';
import ShortcutsDialog from './ShortcutsDialog';

describe('ShortcutsDialog', () => {
  test('the GM sees GM-only shortcuts', () => {
    render(<ShortcutsDialog open isGM onClose={() => {}} />);
    expect(screen.getByText('Cancel the fog polygon')).toBeInTheDocument();
  });

  test('a player does not', () => {
    render(<ShortcutsDialog open isGM={false} onClose={() => {}} />);
    expect(screen.queryByText('Cancel the fog polygon')).toBeNull();
    expect(screen.getByText('Delete the selected drawing')).toBeInTheDocument();
  });

  test('links to the guide section in a new tab', () => {
    render(<ShortcutsDialog open isGM onClose={() => {}} />);
    const link = screen.getByRole('link', { name: 'More in the guide' });
    expect(link).toHaveAttribute('href', '/help/game-screen#keyboard-shortcuts');
    expect(link).toHaveAttribute('target', '_blank');
  });
});
