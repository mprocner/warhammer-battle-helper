import { useCallback } from 'react';
import { parseChatInput } from './parseChatInput';

const fail = (key, params) => ({ ok: false, error: { key, params } });

// Turns one submitted chat line into an action. Every path resolves to the submit
// result contract: { ok: true, effect?: 'help' | 'secretRoll' } | { ok: false, error: { key, params } }.
export default function useChatCommands({ sendMessage, rollExpression, rollVisibility, isGM }) {
    return useCallback(async (text) => {
        const parsed = parseChatInput(text);

        if (parsed.kind === 'message') {
            return sendMessage(parsed.text);
        }
        if (parsed.kind === 'unknownCommand') {
            return fail('chat.commands.errors.unknown', { name: parsed.name });
        }

        const { command, name, args } = parsed;
        if (command.action === 'help') {
            return { ok: true, effect: 'help' };
        }
        if (!args) {
            return fail('chat.commands.errors.missingExpression', { command: name });
        }
        const visibility = command.visibility || rollVisibility;
        const result = await rollExpression(args, visibility);
        // A gm_only roll never comes back to a non-GM roller (WS and the log filter both exclude them),
        // so without this the field just clears and the roll looks lost.
        if (result.ok && visibility === 'gm_only' && !isGM) {
            return { ok: true, effect: 'secretRoll' };
        }
        return result;
    }, [sendMessage, rollExpression, rollVisibility, isGM]);
}
