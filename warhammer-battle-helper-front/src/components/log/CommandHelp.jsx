import React from 'react';
import { useTranslation } from 'react-i18next';
import CloseIcon from '@mui/icons-material/Close';
import { COMMANDS, EXAMPLES } from '../../chat/commands/commandRegistry';

const CommandHelp = ({ onClose }) => {
    const { t } = useTranslation();

    return (
        <div className="chat-commands-popup chat-commands-popup--help" role="dialog" aria-label={t('chat.commands.help.title')}>
            <div className="chat-commands-popup__header">
                <span className="chat-commands-popup__title">{t('chat.commands.help.title')}</span>
                <button type="button" className="chat-commands-popup__close" onClick={onClose} aria-label={t('common.close')}>
                    <CloseIcon fontSize="inherit" />
                </button>
            </div>
            <ul className="chat-commands-popup__list">
                {COMMANDS.map(command => (
                    <li key={command.name} className="chat-commands-popup__item">
                        <span className="chat-commands-popup__usage">{t(command.usageKey)}</span>
                        <span className="chat-commands-popup__description">{t(command.descriptionKey)}</span>
                    </li>
                ))}
            </ul>
            <span className="chat-commands-popup__title">{t('chat.commands.help.examplesTitle')}</span>
            <ul className="chat-commands-popup__list">
                {EXAMPLES.map(example => (
                    <li key={example.notation} className="chat-commands-popup__item">
                        <code className="chat-commands-popup__usage">{example.notation}</code>
                        <span className="chat-commands-popup__description">{t(example.key)}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default CommandHelp;
