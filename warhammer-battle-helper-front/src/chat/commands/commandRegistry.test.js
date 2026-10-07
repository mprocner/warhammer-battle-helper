import { COMMANDS, findCommand, matchCommands } from './commandRegistry';

describe('findCommand', () => {
    it('finds a command by name or alias, case-insensitively', () => {
        expect(findCommand('roll').name).toBe('roll');
        expect(findCommand('R').name).toBe('roll');
        expect(findCommand('gmr').name).toBe('gmroll');
        expect(findCommand('GMROLL').name).toBe('gmroll');
        expect(findCommand('help').name).toBe('help');
    });

    it('returns null for an unknown or empty name', () => {
        expect(findCommand('xyz')).toBeNull();
        expect(findCommand('')).toBeNull();
    });

    it('gmroll forces gm_only visibility, roll does not', () => {
        expect(findCommand('gmroll').visibility).toBe('gm_only');
        expect(findCommand('roll').visibility).toBeUndefined();
    });
});

describe('matchCommands', () => {
    it('lists every command for an empty prefix', () => {
        expect(matchCommands('')).toHaveLength(COMMANDS.length);
    });

    it('matches by name or alias prefix', () => {
        expect(matchCommands('g').map(c => c.name)).toEqual(['gmroll']);
        expect(matchCommands('r').map(c => c.name)).toEqual(['roll']);
        expect(matchCommands('H').map(c => c.name)).toEqual(['help']);
    });

    it('returns nothing when no command matches', () => {
        expect(matchCommands('zz')).toEqual([]);
    });
});
