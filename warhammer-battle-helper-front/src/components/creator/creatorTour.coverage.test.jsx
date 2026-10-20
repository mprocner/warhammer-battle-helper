import React from 'react';
import { render } from '@testing-library/react';
import i18n from '../../i18n';
import TemplateBuilder, { FIELD_TYPES, makeDefaultField, PropertyPanel } from './TemplateBuilder';
import { getTour } from '../tutorial/tours';

// TemplateBuilder pulls in api/axios and, through the system registry, axios itself — the ESM
// import jest cannot parse. Mocking the instance is enough to load the module.
jest.mock('axios', () => {
  const inst = { get: jest.fn(), post: jest.fn(), put: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { __esModule: true, default: { create: () => inst, ...inst } };
});

// The CLAUDE.md rule "a creator change may need a tutorial change" made mechanical where it can
// be: a new property-panel group or General-tab card without a tutorial step fails here.
const t = i18n.t.bind(i18n);
const targetsOf = (tourId) => new Set(getTour(tourId).steps.flatMap(s => (Array.isArray(s.target) ? s.target : [s.target])));

beforeEach(() => {
  localStorage.setItem('tutorialSeen:creator:general', '1');
  localStorage.setItem('tutorialSeen:creator:sheet', '1');
});

test.each(FIELD_TYPES.filter(ft => ft.type !== 'section').map(ft => ft.type))(
  'every property-panel group of a %s field has a tutorial step',
  (type) => {
    const { container } = render(
      <PropertyPanel field={makeDefaultField(type, t)} onChange={() => {}} onDelete={() => {}}
        numberFields={[]} numericFields={[]} sections={[]} />
    );
    const targets = targetsOf('creatorField');
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    const groups = [...container.querySelectorAll('.creator__props-group')]
      // eslint-disable-next-line testing-library/no-node-access
      .filter(el => el.querySelector(':scope > .creator__props-group-title'));
    expect(groups.length).toBeGreaterThan(0);
    groups.forEach(el => {
      const modifier = [...el.classList].find(c => c.startsWith('creator__props-group--'));
      expect(modifier).toBeDefined();
      expect(targets.has(`.${modifier}`)).toBe(true);
    });
  },
);

test('every General-tab settings card has a tutorial step', () => {
  render(<TemplateBuilder template={{ id: 't', name: 'T', settings: {}, sections: [], permissions: { edit: true, share: true, delete: true }, members: [] }} token="x" onClose={() => {}} onTemplateUpdated={() => {}} />);
  const targets = targetsOf('creatorGeneral');
  const cards = [...document.querySelectorAll('.creator__settings-card')];
  expect(cards.length).toBeGreaterThan(0);
  cards.forEach(el => {
    const modifier = [...el.classList].find(c => c.startsWith('creator__settings-card--'));
    expect(modifier).toBeDefined();
    expect(targets.has(`.${modifier}`)).toBe(true);
  });
});
