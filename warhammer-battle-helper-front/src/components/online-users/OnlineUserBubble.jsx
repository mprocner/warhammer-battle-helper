import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { getAvatarUrl } from '../Avatar';
import { resolveDisplayName, resolveAvatar } from '../../utils/participants';

function TooltipAbove({ top, center, text }) {
    return (
        <div
            className="portal-tooltip portal-tooltip--above"
            style={{ top, left: center }}
        >
            {text}
            <span className="portal-tooltip__arrow" />
        </div>
    );
}

function getInitials(username) {
    if (!username) return '?';
    const words = username.trim().split(/\s+/);
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

const OnlineUserBubble = ({ participant, isOnline, bubbleSize = 'small', showSignature = false }) => {
    const { t } = useTranslation();
    const [tooltip, setTooltip] = useState(null);
    const tooltipTimeoutRef = useRef(null);

    const showTooltip = (text, element) => {
        if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
        const rect = element.getBoundingClientRect();
        setTooltip({
            top: rect.top,
            center: rect.left + rect.width / 2,
            text,
        });
    };

    const hideTooltip = () => {
        tooltipTimeoutRef.current = setTimeout(() => setTooltip(null), 100);
    };

    const roleLabel = participant.isGM
        ? t('onlineUsers.role_gm')
        : t('onlineUsers.role_player');
    const displayName = resolveDisplayName(participant) || participant.username;
    const tooltipText = `${displayName} — ${roleLabel}`;
    const avatarUrl = resolveAvatar(participant);

    return (
        <>
            <div className={`online-user-bubble__wrapper online-user-bubble__wrapper--${bubbleSize}`}>
                <div
                    className={`online-user-bubble online-user-bubble--${bubbleSize} ${isOnline ? 'online-user-bubble--online' : 'online-user-bubble--offline'}`}
                    onMouseEnter={e => showTooltip(tooltipText, e.currentTarget)}
                    onMouseLeave={hideTooltip}
                >
                    {avatarUrl ? (
                        <img
                            src={getAvatarUrl(avatarUrl)}
                            alt={displayName}
                            className="online-user-bubble__avatar"
                        />
                    ) : (
                        <span className="online-user-bubble__initials">{getInitials(participant.username)}</span>
                    )}
                    <span className="online-user-bubble__dot" />
                </div>
                {showSignature && (
                    <span className="online-user-bubble__label">{displayName}</span>
                )}
            </div>
            {tooltip && createPortal(
                <TooltipAbove top={tooltip.top} center={tooltip.center} text={tooltip.text} />,
                document.body
            )}
        </>
    );
};

export default OnlineUserBubble;
