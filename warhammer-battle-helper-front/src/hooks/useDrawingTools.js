import { useCallback, useState } from 'react';
import { DEFAULT_TEXT_STYLE } from '../components/scene/drawingText';

/**
 * Manages drawing toolbar UI state: active tool, brush size, color, and the style of the next
 * new text label.
 * The colour starts as the player's colour and follows it (it may arrive after mount, or change
 * in player settings) until the player picks one in the toolbar; from then on the pick wins.
 */
export function useDrawingTools(playerColor) {
  const [activeTool, setActiveTool] = useState('freehand');
  const [brushSize, setBrushSize] = useState(10);
  const [pickedColor, setDrawingColor] = useState(null);
  const [drawingTextStyle, setTextStyle] = useState(DEFAULT_TEXT_STYLE);

  const updateDrawingTextStyle = useCallback((patch) => setTextStyle(prev => ({ ...prev, ...patch })), []);

  return {
    activeTool,
    setActiveTool,
    brushSize,
    setBrushSize,
    drawingColor: pickedColor ?? playerColor,
    setDrawingColor,
    drawingTextStyle,
    updateDrawingTextStyle,
  };
}
