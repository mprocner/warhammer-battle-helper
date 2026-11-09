import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../i18n';
import SceneTokenMultiContextMenu from './SceneTokenMultiContextMenu';

const base = { x: 0, y: 0, selection: [{ kind: 'char', id: 'c1' }], onDelete: jest.fn(), onSetLock: jest.fn(), onSetLayer: jest.fn(), onResetRotation: jest.fn() };

test('add to combat acts on left mousedown and closes', () => {
  const onAddToCombat = jest.fn();
  const onClose = jest.fn();
  render(<SceneTokenMultiContextMenu {...base} onAddToCombat={onAddToCombat} onClose={onClose} />);
  fireEvent.mouseDown(screen.getByText('Add to combat'), { button: 0 });
  expect(onAddToCombat).toHaveBeenCalled();
  expect(onClose).toHaveBeenCalled();
});

test('remove from combat is offered instead when given', () => {
  render(<SceneTokenMultiContextMenu {...base} onRemoveFromCombat={jest.fn()} onClose={jest.fn()} />);
  expect(screen.getByText('Remove from combat')).toBeInTheDocument();
  expect(screen.queryByText('Add to combat')).toBeNull();
});

test('no combat items without handlers (players, creator)', () => {
  render(<SceneTokenMultiContextMenu {...base} onClose={jest.fn()} />);
  expect(screen.queryByText('Add to combat')).toBeNull();
});
