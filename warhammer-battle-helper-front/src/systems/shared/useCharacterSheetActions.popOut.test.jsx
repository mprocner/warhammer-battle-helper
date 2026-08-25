import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { usePopOut } from './useCharacterSheetActions';

// Komponent-sonda: hooka nie da się wywołać poza renderem, więc wieszamy go na przycisku.
function PopOutProbe({ characterId, gameId, rollVisibility }) {
  const popOut = usePopOut(characterId, gameId, rollVisibility);
  return <button onClick={popOut}>pop</button>;
}

function clickPopOut(props) {
  const { getByText } = render(<PopOutProbe {...props} />);
  fireEvent.click(getByText('pop'));
  return window.open.mock.calls[0][0];
}

describe('usePopOut', () => {
  beforeEach(() => {
    window.open = jest.fn();
  });

  it('przenosi rollVisibility do URL osobnego okna', () => {
    const url = clickPopOut({ characterId: 'c1', gameId: 'g1', rollVisibility: 'gm_only' });
    expect(url).toContain('characterId=c1');
    expect(url).toContain('gameId=g1');
    expect(url).toContain('rollVisibility=gm_only');
  });

  // 'all' to wartość domyślna strony standalone — doklejanie jej tylko wydłuża URL.
  it('pomija rollVisibility, gdy jest domyślne', () => {
    const url = clickPopOut({ characterId: 'c1', gameId: 'g1', rollVisibility: 'all' });
    expect(url).not.toContain('rollVisibility');
  });

  it('pomija rollVisibility, gdy nie podano go wcale', () => {
    const url = clickPopOut({ characterId: 'c1', gameId: 'g1' });
    expect(url).not.toContain('rollVisibility');
  });
});
