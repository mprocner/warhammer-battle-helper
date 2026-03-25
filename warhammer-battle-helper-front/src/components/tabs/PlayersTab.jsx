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

  const getInitials = (participant) => {
    const name = resolveDisplayName(participant);
    return name ? name.charAt(0).toUpperCase() : '?';
  };

  return (
    <div className="players-tab">
      <h3 className="players-tab__title">
        {t('players.title')} ({players.length})
      </h3>

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
