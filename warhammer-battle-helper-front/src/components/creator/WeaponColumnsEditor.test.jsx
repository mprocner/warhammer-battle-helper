import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../i18n';
import { WeaponColumnsEditor } from './TemplateBuilder';

// Importing TemplateBuilder pulls in api/axios and, through the system registry, axios itself —
// the ESM import jest cannot parse. Mocking the instance is enough to load the module.
jest.mock('axios', () => {
  const inst = { get: jest.fn(), post: jest.fn(), put: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { __esModule: true, default: { create: () => inst, ...inst } };
});

const twoFlaggedColumns = () => ([
  { key: 'a', label: 'Melee',  type: 'select', options: [], optionsFromSkills: true },
  { key: 'b', label: 'Ranged', type: 'select', options: [], optionsFromSkills: true },
]);

const oneFlaggedColumns = () => ([
  { key: 'a', label: 'Melee',  type: 'select', options: [], optionsFromSkills: true },
  { key: 'b', label: 'Ranged', type: 'select', options: [], optionsFromSkills: false },
]);

// The editor is controlled: it never stores its own columns, it calls onChange and waits for the
// prop to come back. A jest.fn() onChange would leave the columns frozen at their initial value,
// so a second interaction would run against stale data and a passing assertion would prove
// nothing. This harness plays the part the property panel plays in the creator.
function Harness({ initial, onChange }) {
  const [columns, setColumns] = useState(initial);
  return (
    <WeaponColumnsEditor
      columns={columns}
      onChange={next => { setColumns(next); if (onChange) onChange(next); }}
    />
  );
}

describe('WeaponColumnsEditor', () => {
  test('a template carrying two flagged columns renders exactly one badge', () => {
    // Nothing stopped a GM flagging two columns before this feature, and the backend still
    // tolerates it — it simply rolls with the first (weapon.go:73). The badge must agree.
    render(<WeaponColumnsEditor columns={twoFlaggedColumns()} onChange={() => {}} />);
    expect(screen.getAllByText('attack skill')).toHaveLength(1);
  });

  test('flagging column B clears A and names it in the hand-over notice', () => {
    const onChange = jest.fn();
    render(<Harness initial={oneFlaggedColumns()} onChange={onChange} />);

    fireEvent.click(screen.getAllByRole('switch')[1]); // column B's "options from skills"

    expect(onChange).toHaveBeenCalledWith([
      { key: 'a', label: 'Melee',  type: 'select', options: [], optionsFromSkills: false },
      { key: 'b', label: 'Ranged', type: 'select', options: [], optionsFromSkills: true },
    ]);
    expect(screen.getByText('Skill column moved from "Melee"')).toBeInTheDocument();
    expect(screen.getAllByText('attack skill')).toHaveLength(1);
  });

  test('removing the column that just took the flag drops the notice with it', () => {
    // The other way a notice could go stale — the popup switching to another field — is not this
    // component's job: PropertyPanel is keyed by the edited path, so that switch unmounts it.
    // What this component must not do is keep announcing a hand-over to a column it no longer has.
    render(<Harness initial={oneFlaggedColumns()} />);

    fireEvent.click(screen.getAllByRole('switch')[1]);
    expect(screen.getByText('Skill column moved from "Melee"')).toBeInTheDocument();

    // Delete column B — the recipient the notice names.
    fireEvent.click(screen.getAllByTitle('Delete section')[1]);

    expect(screen.queryByText(/Skill column moved from/)).not.toBeInTheDocument();
  });
});
