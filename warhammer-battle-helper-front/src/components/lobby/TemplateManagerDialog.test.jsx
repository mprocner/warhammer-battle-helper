/* eslint-disable testing-library/no-node-access */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../i18n';
import TemplateManagerDialog from './TemplateManagerDialog';

const tpl = (over) => ({ id: 'x', name: 'X', sections: [], version: 1, permissions: { edit: false, share: false, delete: false }, ...over });

const mount = (templates, handlers = {}) => render(
  <TemplateManagerDialog open templates={templates} onClose={() => {}} onCreateTemplate={() => {}}
    onEditTemplate={handlers.edit || (() => {})} onCloneTemplate={() => {}}
    onDeleteTemplate={handlers.del || (() => {})} onLeaveTemplate={handlers.leave || (() => {})} />,
);

// The row's icon buttons carry no accessible name of their own (tooltips are portal-based), so
// they are found by their MUI icon test id.
const icons = (name) => screen.queryAllByTestId(name);

test('an owner gets edit and delete, no leave', () => {
  mount([tpl({ myRole: 'owner', permissions: { edit: true, share: true, delete: true } })]);
  expect(icons('EditIcon')).toHaveLength(1);
  expect(icons('DeleteIcon')).toHaveLength(1);
  expect(icons('LogoutIcon')).toHaveLength(0);
});

test('an editor gets edit and leave, never delete', () => {
  mount([tpl({ myRole: 'editor', permissions: { edit: true, share: false, delete: false } })]);
  expect(icons('EditIcon')).toHaveLength(1);
  expect(icons('DeleteIcon')).toHaveLength(0);
  expect(icons('LogoutIcon')).toHaveLength(1);
  expect(screen.getByText(/· Editor/)).toBeInTheDocument();
});

test('a public template the user is no member of offers clone only', () => {
  mount([tpl({ isPublic: true })]);
  expect(icons('EditIcon')).toHaveLength(0);
  expect(icons('DeleteIcon')).toHaveLength(0);
  expect(icons('LogoutIcon')).toHaveLength(0);
  expect(icons('ContentCopyIcon')).toHaveLength(1);
});

test('leave hands the template to the lobby', () => {
  const leave = jest.fn();
  const viewerTpl = tpl({ myRole: 'viewer' });
  mount([viewerTpl], { leave });
  fireEvent.click(icons('LogoutIcon')[0]);
  expect(leave).toHaveBeenCalledWith(viewerTpl);
});

test('only a template with a description gets the info icon, which opens it', () => {
  mount([tpl({ id: 'a', name: 'With', description: '<p>d</p>', language: 'pl' }), tpl({ id: 'b', name: 'Without' })]);
  expect(icons('InfoOutlinedIcon')).toHaveLength(1);
  fireEvent.click(icons('InfoOutlinedIcon')[0].closest('button'));
  expect(screen.getAllByRole('dialog').pop()).toHaveTextContent('With');
});
