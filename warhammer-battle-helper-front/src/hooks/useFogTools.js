import { useState } from 'react';

/**
 * Manages fog-of-war toolbar UI state: active editing layer, cover vs reveal mode.
 * Also holds imageEditLayer — which image layer (background/tokens/gm) is armed for
 * editing via the Select/Move tool. Persists across mode/scene switches.
 */
export function useFogTools() {
  const [editingLayer, setEditingLayer] = useState(null);
  const [fogCoverMode, setFogCoverMode] = useState(false);
  const [imageEditLayer, setImageEditLayer] = useState('background');

  return {
    editingLayer,
    setEditingLayer,
    fogCoverMode,
    setFogCoverMode,
    imageEditLayer,
    setImageEditLayer,
  };
}
