import { findCommand } from './commandRegistry';

const COMMAND_RE = /^\/(\S*)\s*([\s\S]*)$/;

// Splits chat input into a plain message or a command. It never looks inside the
// arguments — the dice grammar is the backend's job.
export function parseChatInput(text) {
    const trimmed = text.trim();
    if (!trimmed.startsWith('/')) {
        return { kind: 'message', text: trimmed };
    }
    const [, name, rest] = COMMAND_RE.exec(trimmed);
    const command = findCommand(name);
    if (!command) {
        return { kind: 'unknownCommand', name };
    }
    return { kind: 'command', command, name, args: rest.trim() };
}
