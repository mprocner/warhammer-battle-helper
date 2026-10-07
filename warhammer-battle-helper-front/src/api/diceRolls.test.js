import { postRollExpression } from './diceRolls';

// The real module imports axios, whose ESM build CRA's Jest cannot load.
jest.mock('./axios', () => ({
    getApiUrl: () => 'http://api',
    getApiHeaders: (headers = {}) => headers,
}));

const respond = (ok, body) => jest.fn().mockResolvedValue({ ok, json: async () => body });
const args = { gameId: 'g1', token: 'jwt', expression: '2d6', visibility: 'all' };

describe('postRollExpression', () => {
    afterEach(() => { delete global.fetch; });

    it('posts the expression and reports success', async () => {
        global.fetch = respond(true, {});
        await expect(postRollExpression(args)).resolves.toEqual({ ok: true });

        const [url, init] = global.fetch.mock.calls[0];
        expect(url).toBe('http://api/games/g1/rollExpression');
        expect(init.method).toBe('POST');
        expect(init.headers.Authorization).toBe('Bearer jwt');
        expect(JSON.parse(init.body)).toEqual({ expression: '2d6', visibility: 'all' });
    });

    it('maps an invalid expression to its i18n key with a 1-based position', async () => {
        global.fetch = respond(false, { error: 'invalid_expression', code: 'unexpected_token', position: 2, params: null });
        await expect(postRollExpression(args)).resolves.toEqual({
            ok: false,
            error: { key: 'chat.commands.diceErrors.unexpected_token', params: { position: 3 } },
        });
    });

    it('keeps the limit params of a range error', async () => {
        global.fetch = respond(false, { error: 'invalid_expression', code: 'keep_out_of_range', position: 0, params: { max: 3 } });
        const result = await postRollExpression(args);
        expect(result.error.params).toEqual({ max: 3, position: 1 });
    });

    it('reports any other failure as a generic roll error', async () => {
        global.fetch = respond(false, { error: 'boom' });
        await expect(postRollExpression(args)).resolves.toEqual({ ok: false, error: { key: 'chat.commands.errors.rollFailed' } });

        global.fetch = jest.fn().mockRejectedValue(new Error('offline'));
        await expect(postRollExpression(args)).resolves.toEqual({ ok: false, error: { key: 'chat.commands.errors.rollFailed' } });
    });
});
