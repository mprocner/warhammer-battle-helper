import { useState } from 'react';

/**
 * Manages fog-of-war toolbar UI state: active editing layer, cover vs reveal mode.
 */
export function useFogTools() {
  const [editingLayer, setEditingLayer] = useState(null);
  const [fogCoverMode, setFogCoverMode] = useState(false);

  return {
    editingLayer,
    setEditingLayer,
    fogCoverMode,
    setFogCoverMode,
  };
}
