import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './ChatInput.css';

const MAX_MESSAGE_LENGTH = 500;
const COUNTER_THRESHOLD = 450;
const MAX_INPUT_HEIGHT = 120; // ~6 lines, then the textarea scrolls

const ChatInput = ({ onSend }) => {
    const { t } = useTranslation();
    const [message, setMessage] = useState('');
    const textareaRef = useRef(null);

    const resizeToContent = useCallback(() => {
        const el = textareaRef.current;
        if (!el) return;
        // The reset is mandatory: scrollHeight never drops below the element's current height,
        // so without it the field grows but never shrinks back after the text is cleared.
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
    }, []);

    const handleChange = (e) => {
        setMessage(e.target.value);
        resizeToContent();
    };

    const handleSend = () => {
        const trimmed = message.trim();
        if (!trimmed) return;
        onSend(trimmed);
        setMessage('');
        // Not resizeToContent(): setMessage hasn't re-rendered yet, so scrollHeight would still
        // measure the old text and the field would keep its grown height.
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
    };

    const handleKeyDown = (e) => {
        // isComposing: an Enter that confirms an IME candidate must not send the message.
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            handleSend();
        }
    };

    const showCounter = message.length >= COUNTER_THRESHOLD;
    const isFull = message.length >= MAX_MESSAGE_LENGTH;

    return (
        <div className="chat-input">
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
        </div>
    );
};

export default ChatInput;
