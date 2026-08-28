import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import '../../i18n';
import SceneImageContextMenu from './SceneImageContextMenu';
import SceneTokenMultiContextMenu from './SceneTokenMultiContextMenu';

// A right-button press produces `mousedown` on every platform, so that alone dismisses the menu.
// `contextmenu` must NOT dismiss it: on Windows the trusted contextmenu arrives AFTER pointerup,
// i.e. after the replayed click has already opened the menu, and dismissing on it closed the menu
// the user had just asked for (FEATURE-142).
const mouse = (type, init) => new MouseEvent(type, {
  bubbles: true, cancelable: true, view: window, ...init,
});

const imageMenuProps = {
  x: 10, y: 10,
  image: { id: 'img1', layer: 'tokens', zIndex: 0, locked: false },
  onZIndexChange: () => {}, onLayerChange: () => {}, onResizeToGrid: () => {},
  onResetRotation: () => {}, onLockToggle: () => {}, onDuplicate: () => {}, onDelete: () => {},
};

const multiMenuProps = {
  x: 10, y: 10,
  selection: [{ kind: 'image', id: 'a' }, { kind: 'image', id: 'b' }],
  onDelete: () => {}, onSetLock: () => {}, onSetLayer: () => {}, onResetRotation: () => {},
};

describe.each([
  ['SceneImageContextMenu', SceneImageContextMenu, imageMenuProps],
  ['SceneTokenMultiContextMenu', SceneTokenMultiContextMenu, multiMenuProps],
])('%s dismissal', (_name, Menu, props) => {
  it('does not close on an outside contextmenu', () => {
    const onClose = jest.fn();
    render(<Menu {...props} onClose={onClose} />);
    fireEvent(document.body, mouse('contextmenu', { button: 2, clientX: 500, clientY: 500 }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on an outside mousedown', () => {
    const onClose = jest.fn();
    render(<Menu {...props} onClose={onClose} />);
    fireEvent(document.body, mouse('mousedown', { button: 2, clientX: 500, clientY: 500 }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close on a mousedown inside the menu', () => {
    const onClose = jest.fn();
    render(<Menu {...props} onClose={onClose} />);
    // The menu renders through a portal into document.body, not into render's `container`.
    const menu = document.body.querySelector('.scene-context-menu');
    expect(menu).not.toBeNull();
    fireEvent(menu, mouse('mousedown', { button: 0 }));
    expect(onClose).not.toHaveBeenCalled();
  });
});
