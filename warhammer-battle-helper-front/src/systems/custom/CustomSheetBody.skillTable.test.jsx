import React, { useState } from 'react';
import { render, fireEvent, act } from '@testing-library/react';
import '../../i18n';
import CustomSheetBody from './CustomSheetBody';

// One field, two GM rows, one attribute to link against. `attr` on a row only matters when the
// field has assignAttrToSkill, which the sorting/gating tests do not need.
export const tableSections = (over = {}) => ([{
  id: 'sec1',
  columns: 1,
  fields: [
    {
      key: 'fld_skills',
      type: 'skill_table',
      label: 'Umiejętności',
      skills: [
        { id: 'opt_stealth', label: 'Skradanie' },
        { id: 'opt_lore', label: 'Alchemia' },
      ],
      ...over,
    },
  ],
}]);

const rowNames = (container) =>
  [...container.querySelectorAll('.custom-sheet__skill-name')].map(el => el.textContent);

describe('CustomSheetBody skill_table — development marker', () => {
  it('renders no development checkbox by default', () => {
    const { container } = render(<CustomSheetBody sections={tableSections()} />);
    expect(container.querySelectorAll('.custom-sheet__skill-dev-check')).toHaveLength(0);
  });

  it('renders one checkbox per row when the flag is on, before the name', () => {
    const { container } = render(
      <CustomSheetBody sections={tableSections({ showDevelopment: true })} />
    );
    const checks = container.querySelectorAll('.custom-sheet__skill-dev-check');
    expect(checks).toHaveLength(2);
    const row = container.querySelector('.custom-sheet__skill-row');
    expect(row.firstElementChild).toHaveClass('custom-sheet__skill-dev-check');
  });

  it('shows the column header with its icon even without the advances columns', () => {
    const { container } = render(
      <CustomSheetBody sections={tableSections({ showDevelopment: true })} />
    );
    expect(container.querySelector('.custom-sheet__skill-col-label--dev')).not.toBeNull();
  });

  it('ticks the checkbox for a skill already marked and reports a toggle by key', () => {
    const onToggleDevelopment = jest.fn();
    const { container } = render(
      <CustomSheetBody
        sections={tableSections({ showDevelopment: true })}
        developmentSkills={['fld_skills.opt_stealth']}
        onToggleDevelopment={onToggleDevelopment}
      />
    );
    const [first, second] = container.querySelectorAll('.custom-sheet__skill-dev-check');
    expect(first.checked).toBe(true);
    expect(second.checked).toBe(false);

    second.click();
    expect(onToggleDevelopment).toHaveBeenCalledWith('fld_skills.opt_lore');
  });

  it('disables the checkbox with no handler, so a read-only sheet cannot be ticked', () => {
    const { container } = render(
      <CustomSheetBody sections={tableSections({ showDevelopment: true })} />
    );
    expect(container.querySelector('.custom-sheet__skill-dev-check').disabled).toBe(true);
  });
});

describe('CustomSheetBody skill_table — header and grid', () => {
  it('hands the header and the rows the same grid template', () => {
    const { container } = render(
      <CustomSheetBody sections={tableSections({ showDevelopment: true, hasAdvances: true })} />
    );
    const header = container.querySelector('.custom-sheet__skill-table-header');
    const row = container.querySelector('.custom-sheet__skill-row');
    expect(header.style.gridTemplateColumns).toBe('20px 1fr 56px 56px 48px');
    expect(row.style.gridTemplateColumns).toBe(header.style.gridTemplateColumns);
  });

  it('renders no header when neither advances nor development are on', () => {
    const { container } = render(<CustomSheetBody sections={tableSections()} />);
    expect(container.querySelector('.custom-sheet__skill-table-header')).toBeNull();
  });
});

describe('CustomSheetBody skill_table — alphabetical sort', () => {
  it('keeps the template order by default', () => {
    const { container } = render(<CustomSheetBody sections={tableSections()} />);
    expect(rowNames(container)).toEqual(['Skradanie', 'Alchemia']);
  });

  it('sorts rows by label when the flag is on', () => {
    const { container } = render(
      <CustomSheetBody sections={tableSections({ sortAlphabetically: true })} />
    );
    expect(rowNames(container)).toEqual(['Alchemia', 'Skradanie']);
  });
});

describe('CustomSheetBody skill_table — favourites star', () => {
  it('shows the star by default, because templates written before the flag relied on it', () => {
    const { container } = render(
      <CustomSheetBody sections={tableSections()} onToggleFavorite={jest.fn()} />
    );
    expect(container.querySelectorAll('button.coc-star-btn')).toHaveLength(2);
  });

  it('hides the star when the template asks it to', () => {
    const { container } = render(
      <CustomSheetBody sections={tableSections({ hideFavorites: true })} onToggleFavorite={jest.fn()} />
    );
    expect(container.querySelector('.coc-star-btn')).toBeNull();
  });

  it('marks an already-starred skill and toggles by key', () => {
    const onToggleFavorite = jest.fn();
    const { container } = render(
      <CustomSheetBody
        sections={tableSections()}
        favoriteSkills={['fld_skills.opt_stealth']}
        onToggleFavorite={onToggleFavorite}
      />
    );
    const stars = container.querySelectorAll('button.coc-star-btn');
    expect(stars[0]).toHaveClass('coc-star-btn--active');
    expect(stars[1]).not.toHaveClass('coc-star-btn--active');

    stars[1].click();
    expect(onToggleFavorite).toHaveBeenCalledWith('fld_skills.opt_lore');
  });

  it('renders the star statically in the creator, where nothing can be toggled', () => {
    const { container } = render(<CustomSheetBody sections={tableSections()} showAffordances />);
    expect(container.querySelector('.coc-star-btn--static')).not.toBeNull();
    expect(container.querySelector('button.coc-star-btn')).toBeNull();
  });

  it('shows no star at all with neither a handler nor the creator flag', () => {
    const { container } = render(<CustomSheetBody sections={tableSections()} />);
    expect(container.querySelector('.coc-star-btn')).toBeNull();
  });
});

describe('CustomSheetBody skill_table — two columns', () => {
  const fourRows = (over = {}) => ([{
    id: 'sec1',
    columns: 1,
    fields: [{
      key: 'fld_skills',
      type: 'skill_table',
      label: 'Umiejętności',
      skills: [
        { id: 'o1', label: 'A' }, { id: 'o2', label: 'B' },
        { id: 'o3', label: 'C' }, { id: 'o4', label: 'D' }, { id: 'o5', label: 'E' },
      ],
      ...over,
    }],
  }]);

  it('renders one column by default', () => {
    const { container } = render(<CustomSheetBody sections={fourRows()} />);
    expect(container.querySelectorAll('.custom-sheet__skill-col')).toHaveLength(0);
    expect(container.querySelectorAll('.custom-sheet__skill-row')).toHaveLength(5);
  });

  it('splits rows in halves, the odd row going left', () => {
    const { container } = render(<CustomSheetBody sections={fourRows({ twoColumns: true })} />);
    const cols = container.querySelectorAll('.custom-sheet__skill-col');
    expect(cols).toHaveLength(2);
    expect([...cols[0].querySelectorAll('.custom-sheet__skill-name')].map(e => e.textContent))
      .toEqual(['A', 'B', 'C']);
    expect([...cols[1].querySelectorAll('.custom-sheet__skill-name')].map(e => e.textContent))
      .toEqual(['D', 'E']);
  });

  it('gives each column its own header, so both line up with their rows', () => {
    const { container } = render(
      <CustomSheetBody sections={fourRows({ twoColumns: true, hasAdvances: true })} />
    );
    expect(container.querySelectorAll('.custom-sheet__skill-table-header')).toHaveLength(2);
  });
});

// CustomSheetBody is controlled: it never stores customSkillNodes itself, it calls
// onAddCustomSkill/onUpdateCustomSkill/onRemoveCustomSkill and waits for the prop to come back.
// A jest.fn() alone would leave customSkillNodes frozen at its initial value, so a newly added
// node would never actually arrive and an assertion about its edit state would prove nothing.
// This harness plays the part GameSession plays for real, holding the nodes in state; optional
// spies let a test observe the calls without giving up the state wiring. Same pattern as
// WeaponColumnsEditor.test.jsx's Harness.
function Harness({ sections, initialNodes = {}, addSpy, updateSpy, removeSpy }) {
  const [nodes, setNodes] = useState(initialNodes);
  return (
    <CustomSheetBody
      sections={sections}
      customSkillNodes={nodes}
      onAddCustomSkill={(key, node) => {
        if (addSpy) addSpy(key, node);
        setNodes(prev => ({ ...prev, [key]: node }));
      }}
      onUpdateCustomSkill={(key, node) => {
        if (updateSpy) updateSpy(key, node);
        setNodes(prev => ({ ...prev, [key]: node }));
      }}
      onRemoveCustomSkill={(key) => {
        if (removeSpy) removeSpy(key);
        setNodes(prev => { const next = { ...prev }; delete next[key]; return next; });
      }}
      onChange={{ skill: jest.fn() }}
    />
  );
}

describe('CustomSheetBody skill_table — player-added rows', () => {
  const addable = (over = {}) => tableSections({ playerCanAddSkills: true, ...over });

  it('shows no add button when the template does not allow it', () => {
    const { container } = render(
      <CustomSheetBody sections={tableSections()} onAddCustomSkill={jest.fn()} />
    );
    expect(container.querySelector('.custom-sheet__skill-add-btn')).toBeNull();
  });

  it('creates the node immediately, keyed under the field, with an empty label', () => {
    const onAddCustomSkill = jest.fn();
    const { container } = render(
      <CustomSheetBody sections={addable()} onAddCustomSkill={onAddCustomSkill} onChange={{ skill: jest.fn() }} />
    );

    // fireEvent, not a raw DOM .click(): adding a row also sets component state (the edit target
    // and the pinned-to-bottom key), and an untracked native click leaves that update outside act().
    fireEvent.click(container.querySelector('.custom-sheet__skill-add-btn'));

    expect(onAddCustomSkill).toHaveBeenCalledTimes(1);
    const [key, node] = onAddCustomSkill.mock.calls[0];
    expect(key.startsWith('fld_skills.skill_')).toBe(true);
    expect(node).toEqual({ label: '' });
  });

  it('renders a name input on the player\'s row and reports every keystroke', async () => {
    const onAddCustomSkill = jest.fn();
    const onUpdateCustomSkill = jest.fn();
    const { container } = render(
      <Harness sections={addable()} addSpy={onAddCustomSkill} updateSpy={onUpdateCustomSkill} />
    );

    // Drive the real flow: the node only exists once the add button is clicked and the
    // (stateful) prop round-trips back down — a bare jest.fn() would never deliver it.
    fireEvent.click(container.querySelector('.custom-sheet__skill-add-btn'));

    const [key] = onAddCustomSkill.mock.calls[0];
    expect(key.startsWith('fld_skills.skill_')).toBe(true);

    // A freshly created node opens in edit mode, so the row shows a name input.
    const input = container.querySelector('.custom-sheet__skill-name-input');
    expect(input).not.toBeNull();

    // Plain `input.value = x` does not desync React's internal value tracker, so the following
    // dispatch would never reach onChange — same native-setter trick as HandoutsTab.wsRace.test.jsx.
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'Tresura psów');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(onUpdateCustomSkill).toHaveBeenCalledWith(key, { label: 'Tresura psów' });
  });

  it('offers an attribute picker only when the field links skills to attributes', () => {
    const withAttr = [{
      id: 'sec1', columns: 1, fields: [
        { key: 'attr_fel', type: 'attr', label: 'Ogłada', abbr: 'Ogd' },
        { key: 'fld_skills', type: 'skill_table', label: 'Umiejętności', playerCanAddSkills: true,
          assignAttrToSkill: true, skills: [] },
      ],
    }];
    const { container } = render(<Harness sections={withAttr} />);

    fireEvent.click(container.querySelector('.custom-sheet__skill-add-btn'));

    const select = container.querySelector('.custom-sheet__skill-attr-select');
    expect(select).not.toBeNull();
    expect([...select.options].map(o => o.value)).toEqual(['', 'attr_fel']);
  });

  it('leaves edit mode on the check button and comes back on the pencil', () => {
    const { container } = render(
      <CustomSheetBody
        sections={addable()}
        customSkillNodes={{ 'fld_skills.skill_1': { label: 'Tresura psów' } }}
        onAddCustomSkill={jest.fn()}
        onUpdateCustomSkill={jest.fn()}
        onRemoveCustomSkill={jest.fn()}
        onChange={{ skill: jest.fn() }}
      />
    );

    // A named node renders as a plain row: no input, but a pencil and a bin.
    expect(container.querySelector('.custom-sheet__skill-name-input')).toBeNull();
    // fireEvent.click (not a raw DOM .click()) — React 19's automatic batching defers a state
    // update from an untracked native click to a later microtask, so a synchronous assertion
    // right after a raw .click() would still see the pre-click DOM.
    fireEvent.click(container.querySelector('.custom-sheet__skill-edit'));
    expect(container.querySelector('.custom-sheet__skill-name-input')).not.toBeNull();
    fireEvent.click(container.querySelector('.custom-sheet__skill-save'));
    expect(container.querySelector('.custom-sheet__skill-name-input')).toBeNull();
  });

  it('removes the player\'s row by key, and gives GM rows no bin at all', () => {
    const onRemoveCustomSkill = jest.fn();
    const { container } = render(
      <CustomSheetBody
        sections={addable()}
        customSkillNodes={{ 'fld_skills.skill_1': { label: 'Tresura psów' } }}
        onAddCustomSkill={jest.fn()}
        onUpdateCustomSkill={jest.fn()}
        onRemoveCustomSkill={onRemoveCustomSkill}
        onChange={{ skill: jest.fn() }}
      />
    );

    const bins = container.querySelectorAll('.custom-sheet__skill-del');
    expect(bins).toHaveLength(1);
    fireEvent.click(bins[0]);
    expect(onRemoveCustomSkill).toHaveBeenCalledWith('fld_skills.skill_1');
  });

  // Regression: a rename writes through on every keystroke, so a sorted table used to resort the row
  // letter by letter and crawl it out from under the cursor. It must hold its place until ✓.
  it('holds a renamed row in place while typing and moves it once on save', async () => {
    const { container } = render(
      <Harness
        sections={addable({ sortAlphabetically: true })}
        initialNodes={{ 'fld_skills.skill_1': { label: 'Tresura psów' } }}
      />
    );

    // Sorted: Alchemia, Skradanie, Tresura psów.
    expect(rowNames(container)).toEqual(['Alchemia', 'Skradanie', 'Tresura psów']);

    fireEvent.click(container.querySelector('.custom-sheet__skill-edit'));
    const input = container.querySelector('.custom-sheet__skill-name-input');

    // "Bijatyka" sorts between Alchemia and Skradanie, so an unfrozen sort would move the row now.
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'Bijatyka');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // Still third: ordered by the label it had when the rename began.
    expect(container.querySelectorAll('.custom-sheet__skill-row')[2].querySelector('.custom-sheet__skill-name-input').value)
      .toBe('Bijatyka');
    expect(rowNames(container)).toEqual(['Alchemia', 'Skradanie']);

    fireEvent.click(container.querySelector('.custom-sheet__skill-save'));

    // Freeze lifted — the row takes its alphabetical place, once.
    expect(rowNames(container)).toEqual(['Alchemia', 'Bijatyka', 'Skradanie']);
  });

  // Regression: edit mode used to be inferred from a blank label, so the check button could not
  // dismiss a row the player never named — clearing the edit state re-satisfied the very condition
  // that had opened the row, and the click looked broken.
  it('dismisses a row the player never named', () => {
    const { container } = render(<Harness sections={addable()} />);

    fireEvent.click(container.querySelector('.custom-sheet__skill-add-btn'));
    expect(container.querySelector('.custom-sheet__skill-name-input')).not.toBeNull();

    fireEvent.click(container.querySelector('.custom-sheet__skill-save'));

    expect(container.querySelector('.custom-sheet__skill-name-input')).toBeNull();
    // The row itself stays — dismissing edit mode is not deleting the skill. The pencil reopens it.
    expect(container.querySelectorAll('.custom-sheet__skill-edit')).toHaveLength(1);
  });

  it('shows the add button statically in the creator', () => {
    const { container } = render(<CustomSheetBody sections={addable()} showAffordances />);
    const btn = container.querySelector('.custom-sheet__skill-add-btn');
    expect(btn).not.toBeNull();
    expect(btn.disabled).toBe(true);
  });
});

describe('CustomSheetBody skill_table — attribute as the base value', () => {
  const derivedSections = (over = {}) => ([{
    id: 'sec1',
    columns: 1,
    fields: [
      { key: 'attr_ag', type: 'attr', label: 'Zręczność', abbr: 'Zr' },
      {
        key: 'fld_skills',
        type: 'skill_table',
        label: 'Umiejętności',
        hasAdvances: true,
        assignAttrToSkill: true,
        baseFromAttr: true,
        skills: [
          { id: 'opt_stealth', label: 'Skradanie', attr: 'attr_ag' },
          { id: 'opt_lore', label: 'Alchemia' },
        ],
        ...over,
      },
    ],
  }]);

  // `current` on the skill is deliberately stale, exactly as the database holds it for a derived row.
  const values = {
    attributes: { attr_ag: { base: 35, advances: 5, current: 40 } },
    skills: { 'fld_skills.opt_stealth': { base: 0, advances: 5, current: 5 } },
  };

  const baseInputs = (container) =>
    [...container.querySelectorAll('.custom-sheet__skill-val-input--base')];

  it('shows the attribute in the base column and refuses edits there', () => {
    const { container } = render(
      <CustomSheetBody sections={derivedSections()} values={values} onChange={{ skill: jest.fn(), skillAdvances: jest.fn() }} />
    );

    const [stealthBase] = baseInputs(container);
    expect(stealthBase.value).toBe('40');
    expect(stealthBase.readOnly).toBe(true);
    expect(stealthBase).toHaveClass('custom-sheet__skill-val-input--derived');
  });

  it('totals the attribute plus advances, not the stale stored current', () => {
    const { container } = render(
      <CustomSheetBody sections={derivedSections()} values={values} onChange={{ skill: jest.fn(), skillAdvances: jest.fn() }} />
    );

    const totals = [...container.querySelectorAll('.custom-sheet__skill-val-total')].map(e => e.textContent);
    expect(totals[0]).toBe('45');
  });

  it('shows 0 for a row with no attribute, still read-only', () => {
    const { container } = render(
      <CustomSheetBody sections={derivedSections()} values={values} onChange={{ skill: jest.fn(), skillAdvances: jest.fn() }} />
    );

    const loreBase = baseInputs(container)[1];
    expect(loreBase.value).toBe('0');
    expect(loreBase.readOnly).toBe(true);
  });

  it('leaves the base editable when the template flags derivation without an advances column', () => {
    const { container } = render(
      <CustomSheetBody
        sections={derivedSections({ hasAdvances: false })}
        values={values}
        onChange={{ skill: jest.fn(), skillAdvances: jest.fn() }}
      />
    );

    const input = container.querySelector('.custom-sheet__skill-val-input');
    expect(input.readOnly).toBe(false);
    expect(input).not.toHaveClass('custom-sheet__skill-val-input--derived');
  });
});
