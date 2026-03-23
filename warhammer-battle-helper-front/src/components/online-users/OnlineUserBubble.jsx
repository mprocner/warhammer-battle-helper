import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

function getInitials(username) {
    if (!username) return '?';
    const words = username.trim().split(/\s+/);
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

const OnlineUserBubble = ({ participant, isOnline }) => {
    const { t } = useTranslation();
    const [tooltip, setTooltip] = useState(null);
    const tooltipTimeoutRef = useRef(null);

    const showTooltip = (text, element) => {
        if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
        const rect = element.getBoundingClientRect();
        setTooltip({
            top: rect.top + rect.height / 2,
            left: rect.left,
            text,
        });
    };

    const hideTooltip = () => {
        tooltipTimeoutRef.current = setTimeout(() => setTooltip(null), 100);
    };

    const roleLabel = participant.isGM
        ? t('onlineUsers.role_gm')
        : t('onlineUsers.role_player');
    const tooltipText = `${participant.username} — ${roleLabel}`;
    const initials = getInitials(participant.username);

    return (
        <>
            <div
                className={`online-user-bubble ${isOnline ? 'online-user-bubble--online' : 'online-user-bubble--offline'}`}
                onMouseEnter={e => showTooltip(tooltipText, e.currentTarget)}
                onMouseLeave={hideTooltip}
            >
                <span className="online-user-bubble__initials">{initials}</span>
                <span className="online-user-bubble__dot" />
            </div>
            {tooltip && createPortal(
                <div
                    className="portal-tooltip"
                    style={{ top: tooltip.top, left: tooltip.left }}
                >
                    {tooltip.text}
                    <span className="portal-tooltip__arrow" />
                </div>,
                document.body
            )}
        </>
    );
};

export default OnlineUserBubble;
