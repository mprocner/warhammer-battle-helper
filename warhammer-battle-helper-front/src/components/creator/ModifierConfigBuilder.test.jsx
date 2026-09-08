import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../i18n';
import ModifierConfigBuilder from './ModifierConfigBuilder';

describe('ModifierConfigBuilder', () => {
  it('starts disabled when the template has no config and enables with defaults', () => {
    const onChange = jest.fn();
    render(<ModifierConfigBuilder value={undefined} onChange={onChange} />);

    expect(screen.getByTestId('mcb-enable')).not.toBeChecked();
    fireEvent.click(screen.getByTestId('mcb-enable'));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true, traditionalTarget: 'roll', poolTarget: 'dice_count', step: 1,
    }));
  });

  // Konfiguracja wyłączona nie pokazuje pól — wybór targetu bez włącznika to ustawienie,
  // które nic nie robi.
  it('hides the targets while disabled', () => {
    render(<ModifierConfigBuilder value={{ enabled: false }} onChange={() => {}} />);
    expect(screen.queryByTestId('mcb-traditional-target')).toBeNull();
  });

  it('switches the traditional target', () => {
    const onChange = jest.fn();
    render(<ModifierConfigBuilder value={{ enabled: true, traditionalTarget: 'roll', poolTarget: 'dice_count' }} onChange={onChange} />);

    fireEvent.change(screen.getByTestId('mcb-traditional-target'), { target: { value: 'threshold' } });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ traditionalTarget: 'threshold' }));
  });

  it('switches the pool target', () => {
    const onChange = jest.fn();
    render(<ModifierConfigBuilder value={{ enabled: true, traditionalTarget: 'roll', poolTarget: 'dice_count' }} onChange={onChange} />);

    fireEvent.change(screen.getByTestId('mcb-pool-target'), { target: { value: 'success_threshold' } });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ poolTarget: 'success_threshold' }));
  });

  it('shows a hint that names the chosen target', () => {
    render(<ModifierConfigBuilder value={{ enabled: true, traditionalTarget: 'threshold', poolTarget: 'dice_count' }} onChange={() => {}} />);
    expect(screen.getByTestId('mcb-traditional-hint').textContent).toContain('threshold of 55 into 75');
  });

  it('passes step and limits through as numbers', () => {
    const onChange = jest.fn();
    render(<ModifierConfigBuilder value={{ enabled: true, traditionalTarget: 'roll', poolTarget: 'dice_count', step: 1 }} onChange={onChange} />);

    fireEvent.change(screen.getByTestId('mcb-step'), { target: { value: '10' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ step: 10 }));

    fireEvent.change(screen.getByTestId('mcb-min'), { target: { value: '-60' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ min: -60 }));
  });

  it('forwards presets from the editor', () => {
    const onChange = jest.fn();
    render(<ModifierConfigBuilder value={{ enabled: true, traditionalTarget: 'roll', poolTarget: 'dice_count', presets: [] }} onChange={onChange} />);

    fireEvent.click(screen.getByTestId('mpe-add'));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ presets: [{ value: 0, label: '' }] }));
  });

  // Regresja BUG spotkanego w Tasku 11 (ModifierPresetEditor): `parseInt(...) || 0` na każde
  // naciśnięcie klawisza uniemożliwiał wpisanie ujemnej wartości, bo jsdom (i realna przeglądarka
  // dla liczbowych inputów) dostarcza wartość znak-po-znaku, a sam "-" nie parsuje się do liczby.
  // min/max naprawdę przyjmują wartości ujemne (GM ustawia np. min: -60), więc to pole musi
  // trzymać nieparsowalny draft zamiast zerować go na każdym wciśnięciu klawisza.
  // jsdom nie odtwarza buforowania <input type="number"> (przeglądarka pokazuje "-", a do
  // handlera trafia "") — patrz analogiczny komentarz w ModifierPresetEditor.test.jsx. Testujemy
  // więc maszynę stanów na pustym/niepełnym wpisie, nie dosłowny znak minusa.
  it('does not push a value while the min field holds an unparseable draft', () => {
    const onChange = jest.fn();
    render(<ModifierConfigBuilder value={{ enabled: true, traditionalTarget: 'roll', poolTarget: 'dice_count', min: -20 }} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('mcb-min'), { target: { value: '' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps the unparseable min draft in the field instead of snapping it back', () => {
    render(<ModifierConfigBuilder value={{ enabled: true, traditionalTarget: 'roll', poolTarget: 'dice_count', min: -20 }} onChange={() => {}} />);
    const input = screen.getByTestId('mcb-min');
    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');
  });

  it('commits an unparseable min draft as zero on blur', () => {
    const onChange = jest.fn();
    render(<ModifierConfigBuilder value={{ enabled: true, traditionalTarget: 'roll', poolTarget: 'dice_count', min: -20 }} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('mcb-min'), { target: { value: '' } });
    fireEvent.blur(screen.getByTestId('mcb-min'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ min: 0 }));
  });

  it('does not push a value while the max field holds an unparseable draft', () => {
    const onChange = jest.fn();
    render(<ModifierConfigBuilder value={{ enabled: true, traditionalTarget: 'roll', poolTarget: 'dice_count', max: 20 }} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('mcb-max'), { target: { value: '' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('commits an unparseable max draft as zero on blur', () => {
    const onChange = jest.fn();
    render(<ModifierConfigBuilder value={{ enabled: true, min: -60, max: 60 }} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('mcb-max'), { target: { value: '' } });
    fireEvent.blur(screen.getByTestId('mcb-max'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ max: 0, min: -60 }));
  });

  // Kontynuacja regresji z Tasku 11/12: step miał ten sam defekt co min/max, tylko zamaskowany
  // argumentem o ujemnym znaku. `parseInt('') || 1` też odpala się na pustym stringu, więc
  // czyszczenie pola do przepisania go od nowa zatrzaskiwało step na 1 w połowie edycji.
  it('does not push a step while the field holds an unparseable draft', () => {
    const onChange = jest.fn();
    render(<ModifierConfigBuilder value={{ enabled: true, step: 10 }} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('mcb-step'), { target: { value: '' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('commits an unparseable step draft as one on blur', () => {
    const onChange = jest.fn();
    render(<ModifierConfigBuilder value={{ enabled: true, step: 10 }} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('mcb-step'), { target: { value: '' } });
    fireEvent.blur(screen.getByTestId('mcb-step'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ step: 1 }));
  });
});
