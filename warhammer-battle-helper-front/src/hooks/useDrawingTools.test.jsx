import { renderHook, act } from '@testing-library/react';
import { useDrawingTools } from './useDrawingTools';

describe('useDrawingTools colour', () => {
  it('starts in the player colour and follows it until the player picks one', () => {
    const { result, rerender } = renderHook(({ color }) => useDrawingTools(color), { initialProps: { color: '#8a7d6a' } });
    expect(result.current.drawingColor).toBe('#8a7d6a');

    rerender({ color: '#e6194b' }); // participants arrived / colour changed in settings
    expect(result.current.drawingColor).toBe('#e6194b');

    act(() => result.current.setDrawingColor('#00c853'));
    rerender({ color: '#4363d8' }); // a later colour change must not override the manual pick
    expect(result.current.drawingColor).toBe('#00c853');
  });
});
