import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import PersonRemoveIcon from '@mui/icons-material/PersonRemove';
import { getApiUrl, getApiHeaders } from '../../api/axios';
import { getAvatarUrl } from '../Avatar';
import { resolveDisplayName, resolveAvatar } from '../../utils/participants';
import ConfirmModal from '../common/ConfirmModal';
import './PlayersTab.css';

const PlayersTab = ({ gameId, token, gameState, onlineUserIds, onParticipantUpdated }) => {
  const { t } = useTranslation();
  const [confirmKick, setConfirmKick] = useState({ open: false, participant: null });
  const [isKicking, setIsKicking] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteStatus, setInviteStatus] = useState(null); // null | 'success' | 'notFound' | 'alreadyIn' | 'error'
  const [inviteLoading, setInviteLoading] = useState(false);

  const players = (gameState?.participants || []).filter(
    (p) => p.userId !== gameState?.gameMasterId
  );

  const handleKick = (participant) => {
    setConfirmKick({ open: true, participant });
  };

  const doKick = async () => {
    const { participant } = confirmKick;
    if (!participant) return;
    setIsKicking(true);
    try {
      const res = await fetch(`${getApiUrl()}/games/${gameId}/participants/${participant.userId}`, {
        method: 'DELETE',
        headers: getApiHeaders({ Authorization: `Bearer ${token}` }),
      });
      if (!res.ok) throw new Error('Failed to remove player');
      setConfirmKick({ open: false, participant: null });
      onParticipantUpdated?.();
    } catch (err) {
      console.error(err);
    } finally {
      setIsKicking(false);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviteLoading(true);
    setInviteStatus(null);
    try {
      const response = await fetch(`${getApiUrl()}/games/${gameId}/invite`, {
        method: 'POST',
        headers: getApiHeaders({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }),
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });
      if (response.ok) {
        setInviteStatus('success');
        setInviteEmail('');
        onParticipantUpdated?.();
      } else if (response.status === 404) {
        setInviteStatus('notFound');
      } else if (response.status === 409) {
        setInviteStatus('alreadyIn');
      } else {
        setInviteStatus('error');
      }
    } catch {
      setInviteStatus('error');
    } finally {
      setInviteLoading(false);
    }
  };

  const getInitials = (participant) => {
    const name = resolveDisplayName(participant);
    return name ? name.charAt(0).toUpperCase() : '?';
  };

  return (
    <div className="players-tab">
      <div className="players-tab__header">
        <h3 className="players-tab__title">{t('players.title')}</h3>
      </div>

      <section className="players-tab__section">
        <h4 className="players-tab__section-title">{t('settings.invitePlayers')}</h4>
        <div className="players-tab__invite">
          <input
            type="email"
            className="players-tab__invite-input"
            placeholder={t('settings.inviteByEmail')}
            value={inviteEmail}
            onChange={(e) => { setInviteEmail(e.target.value); setInviteStatus(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !inviteLoading) handleInvite(); }}
            disabled={inviteLoading}
          />
          <button
            className="players-tab__invite-btn"
            onClick={handleInvite}
            disabled={inviteLoading || !inviteEmail.trim()}
          >
            {t('settings.invite')}
          </button>
        </div>
        {inviteStatus === 'success' && (
          <p className="players-tab__invite-msg players-tab__invite-msg--success">{t('settings.inviteSuccess')}</p>
        )}
        {inviteStatus === 'notFound' && (
          <p className="players-tab__invite-msg players-tab__invite-msg--error">{t('settings.inviteNotFound')}</p>
        )}
        {inviteStatus === 'alreadyIn' && (
          <p className="players-tab__invite-msg players-tab__invite-msg--error">{t('settings.inviteAlreadyInGame')}</p>
        )}
        {inviteStatus === 'error' && (
          <p className="players-tab__invite-msg players-tab__invite-msg--error">{t('common.error')}</p>
        )}
      </section>

      <section className="players-tab__section">
        <h4 className="players-tab__section-title">{t('players.listTitle')} ({players.length})</h4>
        {players.length === 0 ? (
          <p className="players-tab__empty">{t('players.noPlayers')}</p>
        ) : (
          <ul className="players-tab__list">
            {players.map((p) => {
              const avatar = resolveAvatar(p);
              const isOnline = onlineUserIds.includes(p.userId);
              return (
                <li key={p.userId} className="players-tab__item">
                  <div className="players-tab__avatar">
                    {avatar ? (
                      <img src={getAvatarUrl(avatar)} alt={resolveDisplayName(p)} className="players-tab__avatar-img" />
                    ) : (
                      <span className="players-tab__avatar-initials">{getInitials(p)}</span>
                    )}
                    <span className={`players-tab__online-dot${isOnline ? ' players-tab__online-dot--online' : ''}`} />
                  </div>
                  <div className="players-tab__info">
                    <span className="players-tab__name">{resolveDisplayName(p)}</span>
                    <span className="players-tab__email">{p.email}</span>
                  </div>
                  <button
                    className="players-tab__kick-btn"
                    onClick={() => handleKick(p)}
                    title={t('players.kick')}
                  >
                    <PersonRemoveIcon fontSize="small" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <ConfirmModal
        isOpen={confirmKick.open}
        message={t('players.kickConfirm', { name: resolveDisplayName(confirmKick.participant) })}
        confirmLabel={t('players.kick')}
        onConfirm={doKick}
        onCancel={() => setConfirmKick({ open: false, participant: null })}
        isLoading={isKicking}
      />
    </div>
  );
};

export default PlayersTab;
