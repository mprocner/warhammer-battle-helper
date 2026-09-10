import { TAB_DEFS, tabsForRole } from './tabDefinitions';

describe('tabDefinitions', () => {
  it('keeps the GM tab order the right panel has always rendered', () => {
    expect(tabsForRole(true).map(d => d.id)).toEqual([
      'chat', 'scenes', 'handouts', 'files', 'music', 'notes', 'players', 'minigames', 'general'
    ]);
  });

  it('hides GM-only tabs from players', () => {
    expect(tabsForRole(false).map(d => d.id)).toEqual(['chat', 'handouts', 'notes', 'general']);
  });

  it('gives every tab an icon component', () => {
    TAB_DEFS.forEach(def => expect(typeof def.Icon).not.toBe('undefined'));
  });
});
