import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../i18n';
import RollModifierOverlay from './RollModifierOverlay';

const cfg = (patch = {}) => ({
  enabled: true, traditionalTarget: 'roll', poolTarget: 'dice_count',
  step: 1, min: 0, max: 0, presets: [], ...patch,
});

describe('RollModifierOverlay', () => {
  it('confirms the typed modifier', () => {
    const onConfirm = jest.fn();
    render(<RollModifierOverlay label="Perswazja" config={cfg()} onConfirm={onConfirm} onCancel={() => {}} />);
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '-20' } });
    fireEvent.click(screen.getByRole('button', { name: /roll|rzut/i }));
    expect(onConfirm).toHaveBeenCalledWith(-20);
  });

  it('confirms on Enter and cancels on Escape', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    render(<RollModifierOverlay label="Perswazja" config={cfg()} onConfirm={onConfirm} onCancel={onCancel} />);
    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '7' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledWith(7);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });

  // Kliknięcie chipa jest całą decyzją — osobne "wybierz, potem zatwierdź" to dwa kliknięcia
  // na jedno postanowienie MG.
  it('a preset chip confirms straight away', () => {
    const onConfirm = jest.fn();
    render(
      <RollModifierOverlay
        label="Perswazja"
        config={cfg({ presets: [{ value: -30, label: 'Bardzo trudny' }] })}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    );
    fireEvent.click(screen.getByText('-30'));
    expect(onConfirm).toHaveBeenCalledWith(-30);
  });

  it('clamps a typed value to the configured range before confirming', () => {
    const onConfirm = jest.fn();
    render(<RollModifierOverlay label="Perswazja" config={cfg({ min: -60, max: 60 })} onConfirm={onConfirm} onCancel={() => {}} />);
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '999' } });
    fireEvent.keyDown(screen.getByRole('spinbutton'), { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledWith(60);
  });

  it('cancels when the backdrop is clicked', () => {
    const onCancel = jest.fn();
    const { container } = render(<RollModifierOverlay label="Perswazja" config={cfg()} onConfirm={() => {}} onCancel={onCancel} />);
    fireEvent.click(container.querySelector('.custom-roll-overlay__backdrop'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('shows the label of what is being rolled', () => {
    render(<RollModifierOverlay label="Perswazja" config={cfg()} onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByText('Perswazja')).toBeInTheDocument();
  });
});
