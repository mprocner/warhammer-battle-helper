import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { matchCommands } from '../../chat/commands/commandRegistry';
import useChatHistory from '../../chat/commands/useChatHistory';
import CommandHints from './CommandHints';
import CommandHelp from './CommandHelp';
import './ChatInput.css';

const MAX_MESSAGE_LENGTH = 500;
const COUNTER_THRESHOLD = 450;
const MAX_INPUT_HEIGHT = 120; // ~6 lines, then the textarea scrolls
// A bare "/name" with no space yet is still being typed — the only time hints help.
const BARE_COMMAND_RE = /^\/(\S*)$/;

const ChatInput = ({ onSubmit }) => {
    const { t } = useTranslation();
    const [message, setMessage] = useState('');
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(null); // i18n key of a local confirmation, or null
    const [hintsDismissed, setHintsDismissed] = useState(false);
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const textareaRef = useRef(null);
    const sendingRef = useRef(false);
    const history = useChatHistory();

    // Runs after every value change (typing, send, history recall, completion), so the
    // height always measures the text actually rendered.
    useLayoutEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        // The reset is mandatory: scrollHeight never drops below the element's current height,
        // so without it the field grows but never shrinks back after the text is cleared.
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
    }, [message]);

    const bareCommand = BARE_COMMAND_RE.exec(message);
    const hints = bareCommand && !hintsDismissed ? matchCommands(bareCommand[1]) : [];

    const handleChange = (e) => {
        setMessage(e.target.value);
        setError(null);
        setNotice(null);
        setHintsDismissed(false);
        history.reset();
    };

    const completeCommand = useCallback((command) => {
        setMessage(`/${command.name} `);
        textareaRef.current?.focus();
    }, []);

    const handleSend = async () => {
        const trimmed = message.trim();
        if (!trimmed || sendingRef.current) return;
        sendingRef.current = true;
        try {
            const result = await onSubmit(trimmed);
            if (!result.ok) {
                setError(result.error);
                setNotice(null);
                return;
            }
            history.push(trimmed);
            // Clear only if the field still holds the submitted text; keep what was typed during the request.
            setMessage((cur) => (cur.trim() === trimmed ? '' : cur));
            setError(null);
            setNotice(result.effect === 'secretRoll' ? 'chat.commands.secretRollSent' : null);
            setIsHelpOpen(result.effect === 'help');
        } finally {
            sendingRef.current = false;
        }
    };

    const handleKeyDown = (e) => {
        // isComposing: an Enter that confirms an IME candidate must not send the message.
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            handleSend();
            return;
        }
        if (e.key === 'Tab' && hints.length > 0) {
            e.preventDefault();
            completeCommand(hints[0]);
            return;
        }
        if (e.key === 'Escape') {
            if (isHelpOpen) {
                e.preventDefault();
                setIsHelpOpen(false);
            } else if (hints.length > 0) {
                e.preventDefault();
                setHintsDismissed(true);
            }
            return;
        }
        // History only takes over the arrows on an empty field or an unedited recalled line —
        // anywhere else they must keep moving the caret between lines of a multiline message.
        if (e.key === 'ArrowUp' && (message === '' || history.isShowing(message))) {
            const entry = history.prev();
            if (entry !== null) {
                e.preventDefault();
                setMessage(entry);
            }
            return;
        }
        if (e.key === 'ArrowDown' && history.isShowing(message)) {
            e.preventDefault();
            setMessage(history.next());
        }
    };

    const showCounter = message.length >= COUNTER_THRESHOLD;
    const isFull = message.length >= MAX_MESSAGE_LENGTH;

    return (
        <div className="chat-input">
            {isHelpOpen && <CommandHelp onClose={() => setIsHelpOpen(false)} />}
            {!isHelpOpen && hints.length > 0 && <CommandHints commands={hints} onPick={completeCommand} />}
            <div className="chat-input__field-wrap">
                <textarea
                    ref={textareaRef}
                    rows={1}
                    className="chat-input__field"
                    value={message}
                    maxLength={MAX_MESSAGE_LENGTH}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    placeholder={t('chat.placeholder')}
                />
                {showCounter && (
                    <span className={`chat-input__counter${isFull ? ' chat-input__counter--full' : ''}`}>
                        {t('chat.charCount', { current: message.length, max: MAX_MESSAGE_LENGTH })}
                    </span>
                )}
            </div>
            <button
                className="chat-input__send"
                onClick={handleSend}
                disabled={!message.trim()}
            >
                {t('chat.send')}
            </button>
            {error && (
                <div className="chat-input__error" role="alert">
                    {t(error.key, error.params)}
                </div>
            )}
            {notice && !error && (
                <div className="chat-input__notice" role="status">{t(notice)}</div>
            )}
        </div>
    );
};

export default ChatInput;
