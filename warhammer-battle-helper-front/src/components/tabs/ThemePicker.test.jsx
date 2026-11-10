import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../i18n';
import ThemePicker from './ThemePicker';

describe('ThemePicker', () => {
  it('offers every theme and marks the current one', () => {
    render(<ThemePicker value="scifi" onChange={() => {}} />);
    const options = screen.getAllByRole('radio');
    expect(options).toHaveLength(3);
    expect(screen.getByRole('radio', { name: /sci-fi/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /parchment|pergamin/i })).toHaveAttribute('aria-checked', 'false');
  });

  it('treats a game without a theme as the default one', () => {
    render(<ThemePicker value="" onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: /parchment|pergamin/i })).toHaveAttribute('aria-checked', 'true');
  });

  it('reports the picked theme', () => {
    const onChange = jest.fn();
    render(<ThemePicker value="default" onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: /1920s|lata 20/i }));
    expect(onChange).toHaveBeenCalledWith('twenties');
  });

  it('does not report the theme that is already active', () => {
    const onChange = jest.fn();
    render(<ThemePicker value="scifi" onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: /sci-fi/i }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
