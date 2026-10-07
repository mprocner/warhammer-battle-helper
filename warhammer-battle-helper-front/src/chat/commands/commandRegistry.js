// Chat commands are a UI concept. The backend never sees a command name — only a dice
// expression and a visibility — so adding a command here needs no backend change.
export const COMMANDS = [
    {
        name: 'roll',
        aliases: ['r'],
        action: 'roll',
        usageKey: 'chat.commands.roll.usage',
        descriptionKey: 'chat.commands.roll.description',
    },
    {
        name: 'gmroll',
        aliases: ['gmr'],
        action: 'roll',
        visibility: 'gm_only',
        usageKey: 'chat.commands.gmroll.usage',
        descriptionKey: 'chat.commands.gmroll.description',
    },
    {
        name: 'help',
        aliases: [],
        action: 'help',
        usageKey: 'chat.commands.help.usage',
        descriptionKey: 'chat.commands.help.description',
    },
];

// Dice notation is not language, so it stays a literal; only the explanation is translated.
export const EXAMPLES = [
    { notation: '/r d10', key: 'chat.commands.examples.single' },
    { notation: '/r 3d100', key: 'chat.commands.examples.many' },
    { notation: '/r d100 -1', key: 'chat.commands.examples.modifier' },
    { notation: '/r 2d6 + 1d4 + 3', key: 'chat.commands.examples.mixed' },
    { notation: '/r 4d6kh3', key: 'chat.commands.examples.keepHighest' },
    { notation: '/r 2d20kl1', key: 'chat.commands.examples.keepLowest' },
    { notation: '/r 6d10>=7', key: 'chat.commands.examples.pool' },
    { notation: '/r d100-10 vs 45', key: 'chat.commands.examples.check' },
    { notation: '/gmr d20', key: 'chat.commands.examples.secret' },
];

export function findCommand(token) {
    const name = token.toLowerCase();
    return COMMANDS.find(c => c.name === name || c.aliases.includes(name)) || null;
}

export function matchCommands(prefix) {
    const p = prefix.toLowerCase();
    return COMMANDS.filter(c => c.name.startsWith(p) || c.aliases.some(a => a.startsWith(p)));
}
