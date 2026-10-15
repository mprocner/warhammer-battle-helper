import React, { useState } from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import '../../i18n';
import CustomSheetBody from './CustomSheetBody';

const dataSections = (field = {}) => ([{
  id: 'sec1',
  columns: 1,
  fields: [{
    key: 'inv',
    type: 'data_table',
    label: 'Ekwipunek',
    columns: [
      { key: 'name', label: 'Nazwa', type: 'text' },
      { key: 'qty',  label: 'Ilość', type: 'number' },
      { key: 'desc', label: 'Opis',  type: 'long_text' },
    ],
    presetRows: [],
    ...field,
  }],
}]);

const noop = () => {};
const handlers = { tableAdd: noop, tableAddFromPreset: noop, tableCell: noop, tableRemove: noop };
const withRow = (cells) => ({ tables: { inv: [{ id: 'r1', cells }] } });

describe('data_table — layout', () => {
  it('keeps long_text out of the header and has no star or die', () => {
    const { container } = render(<CustomSheetBody sections={dataSections()} values={withRow({ name: 'Lina' })} onChange={handlers} />);
    const labels = Array.from(container.querySelectorAll('.custom-sheet__row-table-col-label')).map(el => el.textContent);
    expect(labels).toEqual(['', 'Nazwa', 'Ilość', '']);
    expect(container.querySelector('.custom-sheet__star-btn')).toBeNull();
    expect(container.querySelector('.custom-sheet__roll-btn')).toBeNull();
  });
});

describe('data_table — details panel', () => {
  it('toggles the description open and closed', () => {
    const { container } = render(<CustomSheetBody sections={dataSections()} values={withRow({ name: 'Lina', desc: '10 m\nkonopna' })} onChange={handlers} />);
    expect(container.querySelector('.custom-sheet__row-table-details')).toBeNull();

    fireEvent.click(screen.getByTitle('Show details'));
    expect(container.querySelector('.custom-sheet__row-table-detail-text').textContent).toBe('10 m\nkonopna');

    fireEvent.click(screen.getByTitle('Hide details'));
    expect(container.querySelector('.custom-sheet__row-table-details')).toBeNull();
  });

  // The panel must live inside the row element: as a sibling it would be counted by the zebra's
  // :nth-child parity and flip every row after it.
  it('renders the panel inside the row element', () => {
    const { container } = render(<CustomSheetBody sections={dataSections()} values={withRow({ name: 'Lina', desc: 'x' })} onChange={handlers} />);
    fireEvent.click(screen.getByTitle('Show details'));
    const panel = container.querySelector('.custom-sheet__row-table-details');
    expect(panel.parentElement.classList.contains('custom-sheet__row-table-row')).toBe(true);
  });

  it('hides the expander when the row has no description, but keeps its track', () => {
    const { container } = render(<CustomSheetBody sections={dataSections()} values={withRow({ name: 'Lina' })} onChange={handlers} />);
    expect(screen.queryByTitle('Show details')).toBeNull();
    const row = container.querySelector('.custom-sheet__row-table-row');
    expect(row.firstElementChild.classList.contains('custom-sheet__row-table-expander')).toBe(true);
  });

  it('opens the panel as a textarea while editing, and restores the closed state after', () => {
    const { container } = render(<CustomSheetBody sections={dataSections()} values={withRow({ name: 'Lina', desc: 'x' })} onChange={handlers} />);
    fireEvent.click(container.querySelector('.custom-sheet__row-table-edit'));
    expect(container.querySelector('textarea.custom-sheet__row-table-detail-input').value).toBe('x');

    fireEvent.click(container.querySelector('.custom-sheet__row-table-save'));
    expect(container.querySelector('.custom-sheet__row-table-details')).toBeNull();
  });

  it('writes the description through onChange.tableCell', () => {
    const tableCell = jest.fn();
    const { container } = render(<CustomSheetBody sections={dataSections()} values={withRow({ name: 'Lina' })} onChange={{ ...handlers, tableCell }} />);
    fireEvent.click(container.querySelector('.custom-sheet__row-table-edit'));
    fireEvent.change(container.querySelector('textarea.custom-sheet__row-table-detail-input'), { target: { value: 'nowy' } });
    expect(tableCell).toHaveBeenCalledWith('inv', 'r1', 'desc', 'nowy');
  });
});

describe('data_table — removing a row', () => {
  // Confirming while the row is being edited must also close the edit, or editingPath would point
  // at a row that no longer exists.
  it('closes an open edit when the confirmed row is removed', () => {
    const tableRemove = jest.fn();
    const { container } = render(
      <CustomSheetBody sections={dataSections()} values={withRow({ name: 'Lina' })} onChange={{ ...handlers, tableRemove }} />
    );
    fireEvent.click(container.querySelector('.custom-sheet__row-table-edit'));
    fireEvent.click(container.querySelector('.custom-sheet__row-table-remove'));
    expect(screen.getByText('Remove row "Lina"?')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Delete'));
    expect(tableRemove).toHaveBeenCalledWith('inv', 'r1');
    expect(container.querySelector('.custom-sheet__row-table-cell-input')).toBeNull();
  });

  it('names an unnamed row by the field label', () => {
    const { container } = render(
      <CustomSheetBody sections={dataSections()} values={withRow({})} onChange={handlers} />
    );
    fireEvent.click(container.querySelector('.custom-sheet__row-table-remove'));
    expect(screen.getByText('Remove row "Ekwipunek"?')).toBeInTheDocument();
  });
});

describe('data_table — two columns', () => {
  const preset = { id: 'p1', cells: { name: 'Plecak' }, alwaysOn: true };
  const values = { tables: { inv: [{ id: 'r1', cells: { name: 'Lina' } }, { id: 'r2', cells: { name: 'Kostur' } }] } };

  // GM rows and player rows are one list for the split: the GM's come first, and the odd row goes
  // left. Each half is its own table with its own header, so a column is never unlabelled.
  it('splits GM and player rows into two halves, each with its own header', () => {
    const { container } = render(
      <CustomSheetBody sections={dataSections({ presetRows: [preset], twoColumns: true })} values={values} onChange={handlers} />
    );
    const halves = container.querySelectorAll('.custom-sheet__row-table-cols > .custom-sheet__row-table');
    expect(halves).toHaveLength(2);
    const names = half => Array.from(half.querySelectorAll('.custom-sheet__row-table-cell-static--name')).map(el => el.textContent);
    expect(names(halves[0])).toEqual(['Plecak', 'Lina']);
    expect(names(halves[1])).toEqual(['Kostur']);
    halves.forEach(h => expect(h.firstElementChild.classList.contains('custom-sheet__field-header')).toBe(true));
  });

  // The footer belongs to the field, not to a half — inside a half it would be counted as a row.
  it('keeps one footer under both halves', () => {
    const { container } = render(
      <CustomSheetBody sections={dataSections({ twoColumns: true })} values={values} onChange={handlers} />
    );
    expect(container.querySelectorAll('.custom-sheet__row-table-add-row')).toHaveLength(1);
    expect(container.querySelector('.custom-sheet__row-table-cols .custom-sheet__row-table-add-row')).toBeNull();
  });

  it('renders a single table when the flag is off', () => {
    const { container } = render(<CustomSheetBody sections={dataSections()} values={values} onChange={handlers} />);
    expect(container.querySelector('.custom-sheet__row-table-cols')).toBeNull();
    expect(container.querySelectorAll('.custom-sheet__row-table')).toHaveLength(1);
  });
});

describe('data_table — sorting', () => {
  const sorted = (extra = {}) => dataSections({ sortAlphabetically: true, sortColumn: 'name', ...extra });
  // The name column per row, read from the static cell at rest or the first input while editing.
  const names = container => Array.from(container.querySelectorAll('.custom-sheet__row-table-row')).map(row => {
    const cell = row.querySelector('.custom-sheet__row-table-cell-static--name, .custom-sheet__row-table-cell-input');
    return cell.value ?? cell.textContent;
  });

  // GM rows and player rows are one list: a GM row lands wherever its name puts it.
  it('orders GM and player rows together by the picked column', () => {
    const preset = { id: 'p1', cells: { name: 'Kostur' }, alwaysOn: true };
    const values = { tables: { inv: [{ id: 'r1', cells: { name: 'Lina' } }, { id: 'r2', cells: { name: 'Akwawit' } }] } };
    const { container } = render(<CustomSheetBody sections={sorted({ presetRows: [preset] })} values={values} onChange={handlers} />);
    expect(names(container)).toEqual(['Akwawit', 'Kostur', 'Lina']);
  });

  function Harness({ initial }) {
    const [tables, setTables] = useState({ inv: initial });
    const h = {
      ...handlers,
      tableAdd: (fieldKey) => {
        setTables(prev => ({ ...prev, [fieldKey]: [...prev[fieldKey], { id: 'r_new', cells: {} }] }));
        return 'r_new';
      },
      tableCell: (fieldKey, rowId, colKey, value) => setTables(prev => ({
        ...prev,
        [fieldKey]: prev[fieldKey].map(r => (r.id === rowId ? { ...r, cells: { ...r.cells, [colKey]: value } } : r)),
      })),
    };
    return <CustomSheetBody sections={sorted()} values={{ tables }} onChange={h} />;
  }

  // Cells write through on every keystroke; resorting live would move the row away from the cursor.
  it('holds an edited row in place until the edit is closed', () => {
    const { container } = render(<Harness initial={[{ id: 'r1', cells: { name: 'Bęben' } }, { id: 'r2', cells: { name: 'Cep' } }]} />);
    fireEvent.click(container.querySelector('.custom-sheet__row-table-edit'));
    fireEvent.change(container.querySelector('.custom-sheet__row-table-cell-input'), { target: { value: 'Żagiel' } });
    expect(names(container)).toEqual(['Żagiel', 'Cep']);

    fireEvent.click(container.querySelector('.custom-sheet__row-table-save'));
    expect(names(container)).toEqual(['Cep', 'Żagiel']);
  });

  it('keeps a freshly added row at the bottom while it is being filled in', () => {
    const { container } = render(<Harness initial={[{ id: 'r1', cells: { name: 'Cep' } }]} />);
    fireEvent.click(screen.getByText('+ Add row'));
    fireEvent.change(container.querySelector('.custom-sheet__row-table-cell-input'), { target: { value: 'Arkan' } });
    expect(names(container)).toEqual(['Cep', 'Arkan']);

    fireEvent.click(container.querySelector('.custom-sheet__row-table-save'));
    expect(names(container)).toEqual(['Arkan', 'Cep']);
  });
});

describe('data_table — GM rows', () => {
  const preset = { id: 'p1', cells: { name: 'Plecak', desc: 'Skórzany' }, alwaysOn: true };

  it('shows an always-on row read-only with a lock, still expandable', () => {
    const { container } = render(<CustomSheetBody sections={dataSections({ presetRows: [preset] })} onChange={handlers} />);
    const row = container.querySelector('.custom-sheet__row-table-row--preset');
    expect(row.querySelector('.custom-sheet__row-table-lock')).not.toBeNull();
    expect(row.querySelector('.custom-sheet__row-table-edit')).toBeNull();
    fireEvent.click(screen.getByTitle('Show details'));
    expect(container.querySelector('.custom-sheet__row-table-detail-text').textContent).toBe('Skórzany');
  });

  it('offers catalog rows in the footer and copies the picked one', () => {
    const tableAddFromPreset = jest.fn();
    const catalog = { id: 'p2', cells: { name: 'Lina' }, alwaysOn: false };
    const { container } = render(
      <CustomSheetBody sections={dataSections({ presetRows: [catalog] })} onChange={{ ...handlers, tableAddFromPreset }} />
    );
    fireEvent.change(container.querySelector('.custom-sheet__row-table-preset-picker'), { target: { value: 'p2' } });
    expect(tableAddFromPreset).toHaveBeenCalledWith('inv', catalog);
  });
});

describe('data_table — a newly added row opens in edit mode', () => {
  function Harness() {
    const [tables, setTables] = useState({ inv: [] });
    const h = {
      ...handlers,
      tableAdd: (fieldKey) => {
        setTables(prev => ({ ...prev, [fieldKey]: [...(prev[fieldKey] || []), { id: 'r_new', cells: {} }] }));
        return 'r_new';
      },
    };
    return <CustomSheetBody sections={dataSections()} values={{ tables }} onChange={h} />;
  }

  it('renders inputs right after "+ Add row"', () => {
    const { container } = render(<Harness />);
    fireEvent.click(screen.getByText('+ Add row'));
    expect(container.querySelector('.custom-sheet__row-table-cell-input')).not.toBeNull();
  });
});

describe('data_table — creator', () => {
  it('renders the GM row and no footer without handlers', () => {
    const preset = { id: 'p1', cells: { name: 'Plecak' }, alwaysOn: true };
    const { container } = render(<CustomSheetBody sections={dataSections({ presetRows: [preset] })} showAffordances />);
    expect(container.querySelector('.custom-sheet__row-table-row--preset')).not.toBeNull();
    expect(container.querySelector('.custom-sheet__row-table-add-row')).toBeNull();
  });
});
