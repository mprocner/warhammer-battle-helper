import { renderHook } from '@testing-library/react';
import useChatCommands from './useChatCommands';

const setup = (rollVisibility = 'all', isGM = false) => {
    const sendMessage = jest.fn().mockResolvedValue({ ok: true });
    const rollExpression = jest.fn().mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useChatCommands({ sendMessage, rollExpression, rollVisibility, isGM }));
    return { submit: result.current, sendMessage, rollExpression };
};

describe('useChatCommands', () => {
    it('sends plain text as a chat message', async () => {
        const { submit, sendMessage, rollExpression } = setup();
        await expect(submit('hej')).resolves.toEqual({ ok: true });
        expect(sendMessage).toHaveBeenCalledWith('hej');
        expect(rollExpression).not.toHaveBeenCalled();
    });

    it('rolls with the visibility chosen in the panel', async () => {
        const { submit, rollExpression } = setup('gm_and_roller');
        await submit('/r 2d6 + 3');
        expect(rollExpression).toHaveBeenCalledWith('2d6 + 3', 'gm_and_roller');
    });

    it('/gmr forces gm_only regardless of the panel', async () => {
        const { submit, rollExpression } = setup('all');
        await expect(submit('/gmr d20')).resolves.toEqual({ ok: true, effect: 'secretRoll' });
        expect(rollExpression).toHaveBeenCalledWith('d20', 'gm_only');
    });

    it('flags a panel-selected gm_only roll as secret for a non-GM', async () => {
        const { submit } = setup('gm_only');
        await expect(submit('/r d6')).resolves.toEqual({ ok: true, effect: 'secretRoll' });
    });

    it('gives the GM no secret-roll effect on /gmr', async () => {
        const { submit } = setup('all', true);
        await expect(submit('/gmr d20')).resolves.toEqual({ ok: true });
    });

    it('passes a failed secret roll through unchanged', async () => {
        const { submit, rollExpression } = setup('all');
        const failure = { ok: false, error: { key: 'chat.commands.errors.rollFailed' } };
        rollExpression.mockResolvedValue(failure);
        await expect(submit('/gmr d20')).resolves.toEqual(failure);
    });

    it('gives a public roll no effect', async () => {
        const { submit } = setup('all');
        await expect(submit('/r d6')).resolves.toEqual({ ok: true });
    });

    it('/help opens help locally without any request', async () => {
        const { submit, sendMessage, rollExpression } = setup();
        await expect(submit('/help')).resolves.toEqual({ ok: true, effect: 'help' });
        expect(sendMessage).not.toHaveBeenCalled();
        expect(rollExpression).not.toHaveBeenCalled();
    });

    it('rejects a roll without an expression', async () => {
        const { submit, rollExpression } = setup();
        await expect(submit('/r')).resolves.toEqual({
            ok: false,
            error: { key: 'chat.commands.errors.missingExpression', params: { command: 'r' } },
        });
        expect(rollExpression).not.toHaveBeenCalled();
    });

    it('rejects an unknown command locally', async () => {
        const { submit, sendMessage } = setup();
        await expect(submit('/xyz')).resolves.toEqual({
            ok: false,
            error: { key: 'chat.commands.errors.unknown', params: { name: 'xyz' } },
        });
        expect(sendMessage).not.toHaveBeenCalled();
    });
});
