import { getApiUrl, getApiHeaders } from './axios';

const ROLL_FAILED = { ok: false, error: { key: 'chat.commands.errors.rollFailed' } };

// Rolls a chat dice expression. Resolves to the chat submit contract instead of throwing,
// so ChatInput can keep the typed text and show the reason under the field.
export async function postRollExpression({ gameId, token, expression, visibility }) {
    try {
        const response = await fetch(`${getApiUrl()}/games/${gameId}/rollExpression`, {
            method: 'POST',
            headers: getApiHeaders({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }),
            body: JSON.stringify({ expression, visibility }),
        });
        if (response.ok) return { ok: true };

        const body = await response.json().catch(() => ({}));
        if (body.error !== 'invalid_expression') return ROLL_FAILED;

        const params = { ...(body.params || {}) };
        // The backend counts from 0; people count characters from 1.
        if (body.position >= 0) params.position = body.position + 1;
        return { ok: false, error: { key: `chat.commands.diceErrors.${body.code}`, params } };
    } catch {
        return ROLL_FAILED;
    }
}
