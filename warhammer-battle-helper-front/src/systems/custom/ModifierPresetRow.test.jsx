import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ModifierPresetRow from './ModifierPresetRow';

describe('ModifierPresetRow', () => {
  it('renders nothing when there are no presets', () => {
    const { container } = render(<ModifierPresetRow presets={[]} onPick={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when presets are missing entirely', () => {
    const { container } = render(<ModifierPresetRow onPick={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('signs a positive value and shows the GM label next to it', () => {
    render(<ModifierPresetRow presets={[{ value: 20, label: 'Łatwy' }]} onPick={() => {}} />);
    expect(screen.getByText('+20')).toBeInTheDocument();
    expect(screen.getByText('Łatwy')).toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveClass('custom-roll-overlay__preset--plus');
  });

  it('hands the picked value up', () => {
    const onPick = jest.fn();
    render(<ModifierPresetRow presets={[{ value: -30, label: 'Bardzo trudny' }]} onPick={onPick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onPick).toHaveBeenCalledWith(-30);
    expect(screen.getByRole('button')).toHaveClass('custom-roll-overlay__preset--minus');
  });

  // Zero nie jest ani ulgą, ani utrudnieniem — nie dostaje żadnego wariantu. Bez tego przypadku
  // implementacja przypinająca --plus wszystkiemu przeszłaby dwa testy powyżej.
  it('renders a preset with no label and gives zero no tone class', () => {
    render(<ModifierPresetRow presets={[{ value: 0 }]} onPick={() => {}} />);
    expect(screen.getByText('0')).toBeInTheDocument();
    const chip = screen.getByRole('button');
    expect(chip).not.toHaveClass('custom-roll-overlay__preset--plus');
    expect(chip).not.toHaveClass('custom-roll-overlay__preset--minus');
  });
});
