import fs from 'fs';
import path from 'path';
import { SHORTCUTS, formatCombo } from './registry';

// Every keyboard shortcut must be described in the guide's shortcut section, in both languages.
// Combos are written the Windows way (Ctrl), which is also how the guide spells them.
const section = (lang) => {
  const page = fs.readFileSync(path.join(__dirname, '..', 'help', lang, '02-game-screen.md'), 'utf8');
  const start = page.indexOf('{#keyboard-shortcuts}');
  expect(start).toBeGreaterThan(-1);
  const next = page.indexOf('\n## ', start);
  return page.slice(start, next === -1 ? undefined : next);
};

describe.each(['pl', 'en'])('help/%s keyboard shortcuts section', (lang) => {
  const text = section(lang);
  const keyShortcuts = SHORTCUTS.filter(s => s.kind === 'key');

  test.each(keyShortcuts.map(s => [s.id, s]))('mentions %s', (_id, s) => {
    s.combos.forEach(combo => {
      expect(text).toContain(formatCombo(combo, { isMac: false, t: k => k }));
    });
  });

  test('tells how to open the cheat sheet in the game', () => {
    expect(text).toContain('`?`');
  });
});
