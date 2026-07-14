import React from 'react';
import { useTranslation } from 'react-i18next';
import SettingsIcon from '@mui/icons-material/Settings';
import { getAvatarUrl } from '../Avatar';
import { resolveDisplayName, resolveAvatar } from '../../utils/participants';
import { usePortalTooltip } from '../common/PortalTooltip';


function getInitials(username) {
    if (!username) return '?';
    const words = username.trim().split(/\s+/);
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

const OnlineUserBubble = ({ participant, isOnline, bubbleSize = 'small', showSignature = false, isCurrentUser = false, onOpenSettings }) => {
    const { t } = useTranslation();
    const { showTooltip, hideTooltip, tooltipNode } = usePortalTooltip();

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
                    className={`online-user-bubble online-user-bubble--${bubbleSize} ${isOnline ? 'online-user-bubble--online' : 'online-user-bubble--offline'}${isCurrentUser ? ' online-user-bubble--current-user' : ''}`}
                    onMouseEnter={e => showTooltip(tooltipText, e.currentTarget)}
                    onMouseLeave={hideTooltip}
                    onClick={isCurrentUser ? onOpenSettings : undefined}
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
                    {isCurrentUser && (
                        <div className="online-user-bubble__edit-overlay">
                            <SettingsIcon className="online-user-bubble__settings-icon" />
                        </div>
                    )}
                </div>
                {showSignature && (
                    <span className="online-user-bubble__label">{displayName}</span>
                )}
            </div>
            {tooltipNode}
        </>
    );
};

export default OnlineUserBubble;
