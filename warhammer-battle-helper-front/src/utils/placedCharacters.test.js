import { buildPlacedCharacters } from './placedCharacters';

// A minimal server placement (GameCharacter), the shape currentScene.characters holds.
const placement = (over = {}) => ({
  id: 'p1',
  characterId: 'c1',
  name: 'Grimgor',
  avatar: '/a.png',
  positionX: 3,
  positionY: 2,
  w: 1,
  h: 1,
  zIndex: 0,
  ...over,
});

const resolveKnown = (id) => (id === 'c1' ? { id: 'c1', name: 'Grimgor' } : null);
const alwaysDraggable = () => true;

describe('buildPlacedCharacters', () => {
  it('takes the position from the server placement', () => {
    const [tk] = buildPlacedCharacters([placement()], {
      resolveCharacter: resolveKnown,
      canDrag: alwaysDraggable,
    });
    expect(tk.col).toBe(3);
    expect(tk.row).toBe(2);
  });

  it('keeps a fractional free-mode position instead of snapping it to a cell', () => {
    // The whole point of free placement: 3.47 means "47% of a cell right of column 3".
    // Deriving the position from the whole-cell fightZones grid rounded this away.
    const [tk] = buildPlacedCharacters([placement({ positionX: 3.47, positionY: 2.31 })], {
      resolveCharacter: resolveKnown,
      canDrag: alwaysDraggable,
    });
    expect(tk.col).toBe(3.47);
    expect(tk.row).toBe(2.31);
  });

  it('keeps both tokens when two placements round to the same cell', () => {
    // fightZones held one character per cell, so the second placement overwrote the first and a
    // token silently disappeared. Free mode lets tokens sit arbitrarily close.
    const out = buildPlacedCharacters(
      [
        placement({ id: 'p1', characterId: 'c1', positionX: 3.1, positionY: 2.1 }),
        placement({ id: 'p2', characterId: 'c2', positionX: 3.4, positionY: 2.4 }),
      ],
      { resolveCharacter: (id) => ({ id, name: id }), canDrag: alwaysDraggable }
    );
    expect(out).toHaveLength(2);
    expect(out.map(t => t.character.id)).toEqual(['c1', 'c2']);
  });

  it('defaults size to 1x1 and rotation to 0 for placements saved before those fields existed', () => {
    const [tk] = buildPlacedCharacters(
      [{ id: 'p1', characterId: 'c1', name: 'Grimgor', positionX: 0, positionY: 0 }],
      { resolveCharacter: resolveKnown, canDrag: alwaysDraggable }
    );
    expect(tk.w).toBe(1);
    expect(tk.h).toBe(1);
    expect(tk.rotation).toBe(0);
  });

  it('lets an optimistic override win over the server geometry', () => {
    const [tk] = buildPlacedCharacters([placement({ w: 1, h: 1, rotation: 0 })], {
      resolveCharacter: resolveKnown,
      canDrag: alwaysDraggable,
      overrides: { c1: { w: 2, h: 2, rotation: 45 } },
    });
    expect(tk.w).toBe(2);
    expect(tk.h).toBe(2);
    expect(tk.rotation).toBe(45);
  });

  it('falls back to a grid-only stub when the full character is not accessible', () => {
    // A viewer without the character card never receives the Character document; the placement
    // still has to render.
    const [tk] = buildPlacedCharacters([placement({ characterId: 'unknown', isEnemy: true })], {
      resolveCharacter: resolveKnown,
      canDrag: alwaysDraggable,
    });
    expect(tk.character.id).toBe('unknown');
    expect(tk.character.name).toBe('Grimgor');
    expect(tk.character.gridOnly).toBe(true);
    expect(tk.character.isEnemy).toBe(true);
  });

  it('carries the placement fields the token overlay needs', () => {
    const [tk] = buildPlacedCharacters(
      [placement({ zIndex: 7, hidden: true, tokenGear: { bars: [] }, tokenView: { slots: [] } })],
      { resolveCharacter: resolveKnown, canDrag: alwaysDraggable }
    );
    expect(tk.zIndex).toBe(7);
    expect(tk.hidden).toBe(true);
    expect(tk.placementId).toBe('p1');
    expect(tk.tokenGear).toEqual({ bars: [] });
    expect(tk.tokenView).toEqual({ slots: [] });
  });

  it('delegates the drag permission per character', () => {
    const out = buildPlacedCharacters(
      [
        placement({ id: 'p1', characterId: 'c1' }),
        placement({ id: 'p2', characterId: 'c2' }),
      ],
      { resolveCharacter: (id) => ({ id }), canDrag: (id) => id === 'c1' }
    );
    expect(out.find(t => t.character.id === 'c1').canDrag).toBe(true);
    expect(out.find(t => t.character.id === 'c2').canDrag).toBe(false);
  });

  it('returns an empty list when the scene holds no placements', () => {
    expect(buildPlacedCharacters([], { resolveCharacter: resolveKnown, canDrag: alwaysDraggable }))
      .toEqual([]);
  });
});
