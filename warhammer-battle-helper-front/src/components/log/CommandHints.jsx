import React from 'react';
import { useTranslation } from 'react-i18next';

const CommandHints = ({ commands, onPick }) => {
    const { t } = useTranslation();

    return (
        <ul className="chat-commands-popup chat-commands-popup--hints" aria-label={t('chat.commands.hintsLabel')}>
            {commands.map(command => (
                <li
                    key={command.name}
                    className="chat-commands-popup__item"
                    // mousedown, not click: on click the textarea would already have lost focus
                    onMouseDown={(e) => { e.preventDefault(); onPick(command); }}
                >
                    <span className="chat-commands-popup__usage">{t(command.usageKey)}</span>
                    <span className="chat-commands-popup__description">{t(command.descriptionKey)}</span>
                </li>
            ))}
        </ul>
    );
};

export default CommandHints;
