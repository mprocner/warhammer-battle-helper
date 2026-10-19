import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import i18n from '../../i18n';
import { SkillOptionsEditor } from './TemplateBuilder';

// Importing TemplateBuilder pulls in api/axios and, through the system registry, axios itself —
// the ESM import jest cannot parse. Mocking the instance is enough to load the module.
jest.mock('axios', () => {
  const inst = { get: jest.fn(), post: jest.fn(), put: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { __esModule: true, default: { create: () => inst, ...inst } };
});

const skills = [{ id: 'skill_a', label: 'Athletics', attr: '', default: 25 }];

const setup = (props = {}) => {
  const onChange = jest.fn();
  render(<SkillOptionsEditor label="Skills" skills={skills} onChange={onChange} {...props} />);
  return onChange;
};

const rowDefault = (label = 'Athletics') =>
  screen.getByLabelText(i18n.t('creator.skillDefaultAria', { skill: label }));
const draftDefault = () => screen.getByLabelText(i18n.t('creator.skillDefaultDraftAria'));

test('shows the stored default', () => {
  setup();
  expect(rowDefault()).toHaveValue(25);
});

test('editing the default stores an integer', () => {
  const onChange = setup();
  fireEvent.change(rowDefault(), { target: { value: '40' } });
  expect(onChange.mock.calls[0][0][0]).toMatchObject({ id: 'skill_a', default: 40 });
});

test('a decimal is truncated — a fraction 400s the whole template PATCH', () => {
  const onChange = setup();
  fireEvent.change(rowDefault(), { target: { value: '12.7' } });
  expect(onChange.mock.calls[0][0][0].default).toBe(12);
});

test('clearing the input means "no default", not 0', () => {
  const onChange = setup();
  fireEvent.change(rowDefault(), { target: { value: '' } });
  expect(onChange.mock.calls[0][0][0].default).toBeNull();
});

test('a new skill carries the draft default', () => {
  const onChange = setup();
  fireEvent.change(screen.getByPlaceholderText(i18n.t('creator.optionsAddPlaceholder')), { target: { value: 'Swim' } });
  fireEvent.change(draftDefault(), { target: { value: '15' } });
  fireEvent.click(screen.getByLabelText(i18n.t('creator.skillAddAria')));
  const added = onChange.mock.calls[0][0][1];
  expect(added).toMatchObject({ label: 'Swim', default: 15 });
  expect(added.id).toMatch(/^skill_/);
});

test('pressing Enter in the draft default input commits the new skill', () => {
  const onChange = setup();
  fireEvent.change(screen.getByPlaceholderText(i18n.t('creator.optionsAddPlaceholder')), { target: { value: 'Swim' } });
  fireEvent.change(draftDefault(), { target: { value: '15' } });
  fireEvent.keyDown(draftDefault(), { key: 'Enter' });
  expect(onChange.mock.calls[0][0][1]).toMatchObject({ label: 'Swim', default: 15 });
});

test('a new skill without a draft default has no default key', () => {
  const onChange = setup();
  fireEvent.change(screen.getByPlaceholderText(i18n.t('creator.optionsAddPlaceholder')), { target: { value: 'Swim' } });
  fireEvent.click(screen.getByLabelText(i18n.t('creator.skillAddAria')));
  expect(onChange.mock.calls[0][0][1]).not.toHaveProperty('default');
});

test('with a derived base the default inputs are hidden, the stored value untouched', () => {
  const onChange = setup({ baseDerived: true });
  expect(screen.queryByLabelText(i18n.t('creator.skillDefaultAria', { skill: 'Athletics' }))).toBeNull();
  expect(screen.queryByLabelText(i18n.t('creator.skillDefaultDraftAria'))).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
});

describe('reordering', () => {
  const two = [
    { id: 'skill_a', label: 'Athletics', attr: '' },
    { id: 'skill_b', label: '', attr: '' },
  ];

  test('every skill has a labelled drag handle, the add row has none', () => {
    setup({ skills: two });
    expect(screen.getByLabelText(`${i18n.t('creator.skillReorder')} – Athletics`)).toBeInTheDocument();
    // An unnamed skill still gets a handle, labelled without the dash.
    expect(screen.getAllByLabelText(i18n.t('creator.skillReorder'))).toHaveLength(1);
  });

  test('the sorted-on-sheet hint shows only when the sheet sorts', () => {
    const { unmount } = render(<SkillOptionsEditor label="Skills" skills={two} onChange={() => {}} />);
    expect(screen.queryByText(i18n.t('creator.reorderSortedHint'))).not.toBeInTheDocument();
    unmount();
    render(<SkillOptionsEditor label="Skills" skills={two} onChange={() => {}} sortedOnSheet />);
    expect(screen.getByText(i18n.t('creator.reorderSortedHint'))).toBeInTheDocument();
  });
});
