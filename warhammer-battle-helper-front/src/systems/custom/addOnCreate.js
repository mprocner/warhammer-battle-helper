import { walkFields } from '../../utils/templateSections';

// addOnCreateValues builds the rows a brand-new character gets from the template's addOnCreate
// presets — the front-end view of the backend's SeedDefaults (plugin.go), same ids. The creator and
// the lobby preview pass it as `values` so they show the sheet a new player actually starts with.
export function addOnCreateValues(sections) {
  const weapons = {};
  const tables = {};
  walkFields(sections, (f) => {
    if (f.type === 'weapons_table') {
      const rows = (f.presetWeapons || []).filter(p => p.addOnCreate)
        .map(p => ({ id: p.id, cells: { ...(p.cells || {}) }, damage: { ...(p.damage || {}) } }));
      if (rows.length) weapons[f.key] = rows;
    }
    if (f.type === 'data_table') {
      const rows = (f.presetRows || []).filter(p => p.addOnCreate)
        .map(p => ({ id: p.id, cells: { ...(p.cells || {}) } }));
      if (rows.length) tables[f.key] = rows;
    }
  });
  return { weapons, tables };
}
