import React from 'react';
import { useTranslation } from 'react-i18next';
import RowTable from './RowTable';
import { sortColumnKey } from '../rowTableLayout';

// The data_table field: the row-table core with no slots — GM columns and player rows (some seeded from the GM's presets) — for
// anything a character carries that is not rolled (equipment, contacts, notes by entry).
function DataTable({ field, rows, onChange, editingPath, setEditingPath, showTooltip, hideTooltip }) {
  const { t } = useTranslation();

  return (
    <div className="custom-sheet__field custom-sheet__field--data-table">
      <div className="custom-sheet__section-title">{field.label}</div>
      <RowTable
        columns={field.columns || []}
        presets={field.presetRows || []}
        rows={rows}
        labels={{
          add:         t('customSheet.addRow'),
          addFromList: t('customSheet.addRowFromList'),
          edit:        t('customSheet.editRow'),
          save:        t('customSheet.saveRow'),
          remove:      t('customSheet.removeRow'),
          rowFallback: field.label || t('customSheet.row'),
          removeConfirm: name => t('customSheet.removeRowConfirm', { name }),
        }}
        onAdd={onChange ? () => onChange.tableAdd(field.key) : null}
        onAddFromPreset={onChange ? preset => onChange.tableAddFromPreset(field.key, preset) : null}
        onCell={onChange ? (rowId, colKey, val) => onChange.tableCell(field.key, rowId, colKey, val) : null}
        onRemove={onChange ? rowId => onChange.tableRemove(field.key, rowId) : null}
        twoColumns={!!field.twoColumns}
        sortKey={sortColumnKey(field)}
        editingPath={editingPath}
        setEditingPath={setEditingPath}
        showTooltip={showTooltip}
        hideTooltip={hideTooltip}
      />
    </div>
  );
}

export default DataTable;
