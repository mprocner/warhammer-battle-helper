import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import useLobbyFilter from './useLobbyFilter';

// One stable `t`, like the real hook returns; a fresh function per render would bust the memo.
const mockT = (k, o) => o?.defaultValue ?? k;
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }));

const ME = 'me@x.pl';
const mine = (name) => ({ id: name, name, gameMasterEmail: ME, gameSystem: 'warhammer4e' });
const theirs = (name) => ({ id: name, name, gameMasterEmail: 'gm@x.pl', gameSystem: 'warhammer4e' });
const many = (n) => Array.from({ length: n }, (_, i) => (i % 2 ? theirs(`G${i}`) : mine(`G${i}`)));

// Renders the hook under a router at `url` and exposes the current location next to the result.
const setup = (games, url = '/games') => renderHook(
  () => ({ filter: useLobbyFilter(games, ME), location: useLocation() }),
  { wrapper: ({ children }) => <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter> },
);

describe('useLobbyFilter', () => {
  it('reads role and query from the URL', () => {
    const { result } = setup(many(10), '/games?role=gm&q=G1');
    expect(result.current.filter.role).toBe('gm');
    expect(result.current.filter.query).toBe('G1');
    expect(result.current.filter.visibleGames.map(g => g.name)).toEqual([]); // G1 is not mine
    expect(result.current.filter.isFiltering).toBe(true);
  });

  it('treats an unknown role as all', () => {
    const { result } = setup(many(10), '/games?role=boss');
    expect(result.current.filter.role).toBeNull();
    expect(result.current.filter.visibleGames).toHaveLength(10);
    expect(result.current.filter.isFiltering).toBe(false);
  });

  it('ignores role when the chips are hidden', () => {
    const { result } = setup([mine('A'), mine('B')], '/games?role=player');
    expect(result.current.filter.showRoles).toBe(false);
    expect(result.current.filter.role).toBeNull();
    expect(result.current.filter.visibleGames).toHaveLength(2);
  });

  it('ignores the query when the search box is hidden', () => {
    const { result } = setup([mine('A'), theirs('B')], '/games?q=zzz');
    expect(result.current.filter.showSearch).toBe(false);
    expect(result.current.filter.query).toBe('');
    expect(result.current.filter.visibleGames).toHaveLength(2);
  });

  it('writes role and query to the URL and drops defaults', () => {
    const { result } = setup(many(10));
    act(() => result.current.filter.setRole('player'));
    expect(result.current.location.search).toBe('?role=player');
    act(() => result.current.filter.setQuery('G'));
    expect(result.current.location.search).toBe('?role=player&q=G');
    act(() => result.current.filter.setRole(null));
    expect(result.current.location.search).toBe('?q=G');
    act(() => result.current.filter.setQuery(''));
    expect(result.current.location.search).toBe('');
  });

  it('clear removes both params', () => {
    const { result } = setup(many(10), '/games?role=gm&q=x');
    act(() => result.current.filter.clear());
    expect(result.current.location.search).toBe('');
  });

  it('keeps unrelated params', () => {
    const { result } = setup(many(10), '/games?other=1');
    act(() => result.current.filter.setRole('gm'));
    expect(result.current.location.search).toBe('?other=1&role=gm');
  });
});
