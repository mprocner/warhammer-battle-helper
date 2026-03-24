import React, { useState, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { getAvatarUrl } from '../Avatar';
import { resolveDisplayName, resolveAvatar } from '../../utils/participants';

const MARGIN = 8;

function TooltipAbove({ top, center, text }) {
    const ref = useRef(null);
    const [left, setLeft] = useState(center);
    const [arrowLeft, setArrowLeft] = useState('50%');

    useLayoutEffect(() => {
        if (!ref.current) return;
        const w = ref.current.offsetWidth;
        const clamped = Math.min(
            Math.max(center - w / 2, MARGIN),
            window.innerWidth - w - MARGIN
        );
        setLeft(clamped);
        setArrowLeft(`${center - clamped}px`);
    }, [center, text]);

    return (
        <div
            ref={ref}
            className="portal-tooltip portal-tooltip--above"
            style={{ top, left }}
        >
            {text}
            <span className="portal-tooltip__arrow" style={{ left: arrowLeft }} />
        </div>
    );
}

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
            <div
                className={`online-user-bubble ${isOnline ? 'online-user-bubble--online' : 'online-user-bubble--offline'}`}
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
            {tooltip && createPortal(
                <TooltipAbove top={tooltip.top} center={tooltip.center} text={tooltip.text} />,
                document.body
            )}
        </>
    );
};

export default OnlineUserBubble;
