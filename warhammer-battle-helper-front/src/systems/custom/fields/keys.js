// genId mints a stable, opaque key for a player-added skill node — never derived from the typed
// name, so two skills can share a name and renaming never affects the key. Matches the
// surrogate-key convention used GM-side in TemplateBuilder.
//
// It lives outside CustomSheetBody because both the sheet (skill_tree) and SkillTable mint keys;
// importing it from CustomSheetBody would make SkillTable and its parent import each other.
export function genId(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}
