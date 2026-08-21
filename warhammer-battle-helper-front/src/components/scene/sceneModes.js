import PanToolIcon from '@mui/icons-material/PanTool';
import HighlightAltIcon from '@mui/icons-material/HighlightAlt';
import StraightenIcon from '@mui/icons-material/Straighten';
import CloudIcon from '@mui/icons-material/Cloud';
import EditIcon from '@mui/icons-material/Edit';

// Single source of truth for scene modes (`editingLayer`). Both the toolbar
// buttons and the middle-click cycle read this list, so adding a mode here is
// the only change a new mode needs — the button appears and the cycle picks it
// up with no other edits.
export const SCENE_MODES = [
  { value: null,      Icon: PanToolIcon,      labelKey: 'scenes.panLayer'                   },
  { value: 'select',  Icon: HighlightAltIcon, labelKey: 'scenes.selectLayer',  gmOnly: true },
  { value: 'measure', Icon: StraightenIcon,   labelKey: 'scenes.measureLayer'               },
  { value: 'fog',     Icon: CloudIcon,        labelKey: 'scenes.fogLayer',     gmOnly: true },
  { value: 'drawing', Icon: EditIcon,         labelKey: 'scenes.drawingLayer'               },
];

export const modesForRole = (isGM) => SCENE_MODES.filter(m => isGM || !m.gmOnly);

// Split out of nextMode so it can be tested against a fabricated list — proof
// that the cycle does not depend on how many modes exist.
// findIndex returns -1 for a value missing from the list, and (-1 + 1) % len
// lands on 0, which resets to the first mode instead of getting stuck.
export const cycleNext = (list, current) => {
  const i = list.findIndex(m => m.value === current);
  return list[(i + 1) % list.length].value;
};

export const nextMode = (current, isGM) => cycleNext(modesForRole(isGM), current);

export const modeLabelKey = (value) =>
  SCENE_MODES.find(m => m.value === value)?.labelKey || 'scenes.panLayer';

// Guard for the middle-click shortcut. `buttons` is a bitmask of every button
// currently held: left 1, right 2, middle 4, back 8, forward 16. Masking with 3
// rejects a middle click made while left or right is down — i.e. mid token
// drag, mid drawing stroke, mid rotate — without any shared state between
// components, because every map operation holds the left button.
// Do not narrow this to `buttons !== 4`: that also rejects a user holding a
// gaming-mouse side button, which is harmless.
export const isModeCycleClick = (e, activeElement) => {
  if (e.button !== 1) return false;
  if (e.buttons & 3) return false;
  if (!/^(INPUT|TEXTAREA)$/.test(activeElement?.tagName || '')) return true;
  // Only a text field belonging to the map surface blocks the shortcut. A chat or
  // notes field in the side panel is unrelated — and because mousedown fires before
  // focus moves, a global check would silently swallow the first click after typing.
  return !activeElement.closest?.('.scene-viewport, .drawing-toolbar');
};
