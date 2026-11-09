import { SEARCH_THRESHOLD, filterLobbyGames, gameRole, lobbyFilterVisibility } from './lobbyFilter';

const ME = 'me@x.pl';
// Mirrors i18next for the two built-in labels the tests use; unknown keys fall back.
const t = (key, opts) => ({ 'gameSystems.coc7e': 'Call of Cthulhu 7e' }[key] ?? opts?.defaultValue ?? key);

const game = (over) => ({ id: over.name, gameMasterEmail: 'gm@x.pl', gameSystem: 'warhammer4e', ...over });
const mine = (over) => game({ gameMasterEmail: ME, ...over });
const many = (n) => Array.from({ length: n }, (_, i) => mine({ name: `G${i}` }));

describe('gameRole', () => {
  it('is gm when the user runs the game', () => {
    expect(gameRole(mine({ name: 'A' }), ME)).toBe('gm');
  });
  it('is player otherwise', () => {
    expect(gameRole(game({ name: 'A' }), ME)).toBe('player');
  });
});

describe('lobbyFilterVisibility', () => {
  it('shows roles only when the user has games in both roles', () => {
    expect(lobbyFilterVisibility([mine({ name: 'A' }), mine({ name: 'B' })], ME).showRoles).toBe(false);
    expect(lobbyFilterVisibility([game({ name: 'A' })], ME).showRoles).toBe(false);
    expect(lobbyFilterVisibility([mine({ name: 'A' }), game({ name: 'B' })], ME).showRoles).toBe(true);
  });
  it('shows search only above the threshold', () => {
    expect(SEARCH_THRESHOLD).toBe(8);
    expect(lobbyFilterVisibility(many(8), ME).showSearch).toBe(false);
    expect(lobbyFilterVisibility(many(9), ME).showSearch).toBe(true);
  });
  it('shows nothing for an empty list', () => {
    expect(lobbyFilterVisibility([], ME)).toEqual({ showRoles: false, showSearch: false });
  });
});

describe('filterLobbyGames', () => {
  const games = [
    mine({ name: 'Zamek w Łodzi' }),
    game({ name: 'Mgła', gameSystem: 'coc7e' }),
    mine({ name: 'Krypta', gameSystem: 'custom', customSystemTemplate: { name: 'Mroczny Świat' } }),
  ];
  const names = (list) => list.map(g => g.name);
  const run = (role, query) => names(filterLobbyGames(games, { role, query, userEmail: ME, t }));

  it('returns everything with no role and an empty query', () => {
    expect(run(null, '')).toEqual(['Zamek w Łodzi', 'Mgła', 'Krypta']);
  });
  it('filters by role', () => {
    expect(run('gm', '')).toEqual(['Zamek w Łodzi', 'Krypta']);
    expect(run('player', '')).toEqual(['Mgła']);
  });
  it('matches the name ignoring case and Polish letters', () => {
    expect(run(null, 'lodzi')).toEqual(['Zamek w Łodzi']);
    expect(run(null, 'ZAMEK')).toEqual(['Zamek w Łodzi']);
  });
  it('matches the built-in system label', () => {
    expect(run(null, 'cthulhu')).toEqual(['Mgła']);
  });
  it('matches the template name of a custom game', () => {
    expect(run(null, 'swiat')).toEqual(['Krypta']);
  });
  it('treats a whitespace-only query as empty', () => {
    expect(run(null, '   ')).toHaveLength(3);
  });
  it('combines role and query', () => {
    expect(run('player', 'zamek')).toEqual([]);
    expect(run('gm', 'krypta')).toEqual(['Krypta']);
  });
  it('keeps the original order', () => {
    expect(run(null, 'a')).toEqual(['Zamek w Łodzi', 'Mgła', 'Krypta']);
  });
});
