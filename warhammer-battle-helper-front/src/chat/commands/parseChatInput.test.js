import { parseChatInput } from './parseChatInput';

describe('parseChatInput', () => {
    it('treats text without a leading slash as a message', () => {
        expect(parseChatInput('  hej  ')).toEqual({ kind: 'message', text: 'hej' });
    });

    it('splits a command into the command and its arguments', () => {
        const parsed = parseChatInput('/r 2d6 + 3');
        expect(parsed.kind).toBe('command');
        expect(parsed.command.name).toBe('roll');
        expect(parsed.name).toBe('r');
        expect(parsed.args).toBe('2d6 + 3');
    });

    it('resolves aliases and upper case', () => {
        expect(parseChatInput('/ROLL d10').command.name).toBe('roll');
        expect(parseChatInput('/gmr d20').command.name).toBe('gmroll');
    });

    it('returns empty args for a bare command', () => {
        expect(parseChatInput('/help').args).toBe('');
        expect(parseChatInput('/r').args).toBe('');
    });

    it('reports an unknown command by its typed name', () => {
        expect(parseChatInput('/xyz 1')).toEqual({ kind: 'unknownCommand', name: 'xyz' });
    });
});
