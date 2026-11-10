import { useState } from 'react';

/**
 * Manages drawing toolbar UI state: active tool, brush size, color, font size.
 * The colour starts as the player's colour and follows it (it may arrive after mount, or change
 * in player settings) until the player picks one in the toolbar; from then on the pick wins.
 */
export function useDrawingTools(playerColor) {
  const [activeTool, setActiveTool] = useState('freehand');
  const [brushSize, setBrushSize] = useState(10);
  const [pickedColor, setDrawingColor] = useState(null);
  const [drawingFontSize, setDrawingFontSize] = useState(16);

  return {
    activeTool,
    setActiveTool,
    brushSize,
    setBrushSize,
    drawingColor: pickedColor ?? playerColor,
    setDrawingColor,
    drawingFontSize,
    setDrawingFontSize,
  };
}
