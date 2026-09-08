import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../i18n';
import ModifierPresetEditor from './ModifierPresetEditor';

// Ten komponent jest kontrolowany: `remove`/`add` tylko wołają onChange, a nowa lista wraca do
// niego dopiero jako prop od rodzica. Harness odgrywa tego rodzica, żeby test mógł sprawdzić, co
// faktycznie widać w polach PO usunięciu wiersza — nie tylko z czym wywołano onChange.
function ControlledEditor({ initial }) {
  const [presets, setPresets] = useState(initial);
  return <ModifierPresetEditor presets={presets} onChange={setPresets} />;
}

describe('ModifierPresetEditor', () => {
  it('adds a preset with a zero value', () => {
    const onChange = jest.fn();
    render(<ModifierPresetEditor presets={[]} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('mpe-add'));
    expect(onChange).toHaveBeenCalledWith([{ value: 0, label: '' }]);
  });

  it('edits a value and keeps the label', () => {
    const onChange = jest.fn();
    render(<ModifierPresetEditor presets={[{ value: -20, label: 'Trudny' }]} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('mpe-value-0'), { target: { value: '-30' } });
    expect(onChange).toHaveBeenCalledWith([{ value: -30, label: 'Trudny' }]);
  });

  it('edits a label and keeps the value', () => {
    const onChange = jest.fn();
    render(<ModifierPresetEditor presets={[{ value: -20, label: 'Trudny' }]} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('mpe-label-0'), { target: { value: 'Bardzo trudny' } });
    expect(onChange).toHaveBeenCalledWith([{ value: -20, label: 'Bardzo trudny' }]);
  });

  // jsdom nie odtwarza buforowania <input type="number"> (przeglądarka pokazuje "-", a do handlera
  // trafia ""), więc testujemy maszynę stanów: pusty/niepełny wpis nie może wypchnąć wartości.
  it('does not push a value while the field holds an unparseable draft', () => {
    const onChange = jest.fn();
    render(<ModifierPresetEditor presets={[{ value: -20, label: 'Trudny' }]} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('mpe-value-0'), { target: { value: '' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps the unparseable draft in the field instead of snapping it back', () => {
    render(<ModifierPresetEditor presets={[{ value: -20, label: 'Trudny' }]} onChange={() => {}} />);
    const input = screen.getByTestId('mpe-value-0');
    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');
  });

  it('commits an unparseable draft as zero on blur', () => {
    const onChange = jest.fn();
    render(<ModifierPresetEditor presets={[{ value: -20, label: 'Trudny' }]} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('mpe-value-0'), { target: { value: '' } });
    fireEvent.blur(screen.getByTestId('mpe-value-0'));
    expect(onChange).toHaveBeenCalledWith([{ value: 0, label: 'Trudny' }]);
  });

  it('removes the right row', () => {
    const onChange = jest.fn();
    render(<ModifierPresetEditor presets={[{ value: 10, label: 'A' }, { value: 20, label: 'B' }]} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('mpe-remove-0'));
    expect(onChange).toHaveBeenCalledWith([{ value: 20, label: 'B' }]);
  });

  // jsdom nie przenosi focusu ani nie odpala blur, gdy klika się gdzie indziej — więc to jedyny
  // sposób w teście, żeby złapać draft wciąż "żywy" (nieodparsowany) w chwili gdy usuwany jest
  // INNY wiersz. Draft jest kluczowany indeksem, a remove przesuwa indeksy o jeden w dół, więc bez
  // czyszczenia w remove() ten draft doczepiłby się do złego wiersza po przeliczeniu indeksów.
  it('does not leak a stale draft onto the row that shifts into its index after a remove', () => {
    render(
      <ControlledEditor
        initial={[{ value: 10, label: 'A' }, { value: 20, label: 'B' }, { value: -20, label: 'C' }]}
      />
    );
    fireEvent.change(screen.getByTestId('mpe-value-2'), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('mpe-remove-0'));
    // Po usunięciu wiersza 0, dawny wiersz 2 ("C") staje się wierszem 1 — pole powinno pokazać
    // jego rzeczywistą wartość (-20), a nie osierocony draft "" po dawnym wierszu 2.
    expect(screen.getByTestId('mpe-value-1').value).toBe('-20');
  });

  it('renders an empty hint with no presets', () => {
    render(<ModifierPresetEditor presets={[]} onChange={() => {}} />);
    expect(screen.getByTestId('mpe-empty')).toBeInTheDocument();
  });
});
