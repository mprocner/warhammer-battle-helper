import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import i18n from '../../i18n';
import SuccessLevelsBuilder from './SuccessLevelsBuilder';

const tiersValue = () => ({
  mode: 'tiers',
  success: { label: 'Mine', color: '#111111' },
  failure: { label: 'Nope', color: '#222222' },
  tiers: [
    { id: 'a', divisor: 5, label: 'Extreme', color: '#333333' },
    { id: 'b', divisor: 2, label: 'Hard', color: '#444444' },
  ],
});

describe('SuccessLevelsBuilder', () => {
  it('starts off when the template has no config', () => {
    render(<SuccessLevelsBuilder value={undefined} onChange={() => {}} />);
    expect(screen.getByTestId('slb-mode-off')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByTestId('slb-step')).toBeNull();
  });

  it('seeds default thresholds in the GM language on first entry', () => {
    const onChange = jest.fn();
    render(<SuccessLevelsBuilder value={undefined} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('slb-mode-tiers'));
    const cfg = onChange.mock.calls[0][0];
    expect(cfg.mode).toBe('tiers');
    expect(cfg.tiers.map(x => x.divisor)).toEqual([5, 2]);
    expect(cfg.success.label).toBe(i18n.t('creator.successLevels.default.success'));
    expect(cfg.failure.label).toBe(i18n.t('creator.successLevels.default.failure'));
  });

  it('keeps the GM thresholds when switching off and back on', () => {
    const onChange = jest.fn();
    const { rerender } = render(<SuccessLevelsBuilder value={tiersValue()} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('slb-mode-off'));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ mode: '', tiers: tiersValue().tiers }));

    rerender(<SuccessLevelsBuilder value={{ ...tiersValue(), mode: '' }} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('slb-mode-tiers'));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      mode: 'tiers', success: { label: 'Mine', color: '#111111' },
    }));
  });

  it('commits a step and shows a live example', () => {
    const onChange = jest.fn();
    render(<SuccessLevelsBuilder value={{ mode: 'tens', step: 10 }} onChange={onChange} />);
    expect(screen.getByTestId('slb-example')).toHaveTextContent('+1');
    fireEvent.change(screen.getByTestId('slb-step'), { target: { value: '5' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ step: 5 }));
  });

  it('holds a duplicate divisor as a flagged draft instead of saving it', () => {
    const onChange = jest.fn();
    render(<SuccessLevelsBuilder value={tiersValue()} onChange={onChange} />);
    const input = screen.getByTestId('slb-divisor-b');
    fireEvent.change(input, { target: { value: '5' } });
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveClass('slb__divisor--invalid');
    expect(screen.getByText(i18n.t('creator.successLevels.divisorError'))).toBeInTheDocument();
  });

  it('commits a valid divisor', () => {
    const onChange = jest.fn();
    render(<SuccessLevelsBuilder value={tiersValue()} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('slb-divisor-b'), { target: { value: '3' } });
    const cfg = onChange.mock.calls[0][0];
    expect(cfg.tiers.find(x => x.id === 'b').divisor).toBe(3);
  });

  it('adds the smallest free divisor in sorted position', () => {
    const onChange = jest.fn();
    render(<SuccessLevelsBuilder value={tiersValue()} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('slb-add'));
    expect(onChange.mock.calls[0][0].tiers.map(x => x.divisor)).toEqual([5, 3, 2]);
  });

  it('removes a threshold but never the fixed rows', () => {
    const onChange = jest.fn();
    render(<SuccessLevelsBuilder value={tiersValue()} onChange={onChange} />);
    expect(screen.queryByTestId('slb-remove-success')).toBeNull();
    fireEvent.click(screen.getByTestId('slb-remove-a'));
    expect(onChange.mock.calls[0][0].tiers.map(x => x.id)).toEqual(['b']);
  });

  it('edits a fixed row label', () => {
    const onChange = jest.fn();
    render(<SuccessLevelsBuilder value={tiersValue()} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('slb-label-failure'), { target: { value: 'Miss' } });
    expect(onChange.mock.calls[0][0].failure).toEqual({ label: 'Miss', color: '#222222' });
  });

  it('does not write a config when the active mode is clicked again', () => {
    const onChange = jest.fn();
    render(<SuccessLevelsBuilder value={undefined} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('slb-mode-off'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('never commits a fractional divisor', () => {
    const onChange = jest.fn();
    render(<SuccessLevelsBuilder value={tiersValue()} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('slb-divisor-b'), { target: { value: '2.5' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('flags an out-of-range step draft without committing it', () => {
    const onChange = jest.fn();
    render(<SuccessLevelsBuilder value={{ mode: 'tens', step: 10 }} onChange={onChange} />);
    const input = screen.getByTestId('slb-step');
    fireEvent.change(input, { target: { value: '0' } });
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveClass('slb__step--invalid');
  });

  it('re-sorts the tiers on blur', () => {
    const onChange = jest.fn();
    const { rerender } = render(<SuccessLevelsBuilder value={tiersValue()} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('slb-divisor-b'), { target: { value: '7' } });
    const committed = onChange.mock.calls[0][0];
    expect(committed.tiers.map(x => x.id)).toEqual(['a', 'b']);
    onChange.mockClear();
    rerender(<SuccessLevelsBuilder value={committed} onChange={onChange} />);
    fireEvent.blur(screen.getByTestId('slb-divisor-b'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].tiers.map(x => x.id)).toEqual(['b', 'a']);
  });

  it('reverts an invalid divisor draft on blur without committing', () => {
    const onChange = jest.fn();
    render(<SuccessLevelsBuilder value={tiersValue()} onChange={onChange} />);
    const input = screen.getByTestId('slb-divisor-b');
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue(2);
  });
});
