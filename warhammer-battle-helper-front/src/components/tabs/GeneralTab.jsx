import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { getApiUrl, getApiHeaders } from '../../api/axios';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import LogoutIcon from '@mui/icons-material/Logout';
import './GeneralTab.css';

/**
 * General settings tab - contains game info, language settings, and actions
 */
const GeneralTab = ({ onLogout, onLeaveGame, onGoToGameList, gameState, isConnected, playerVolume, onPlayerVolumeChange, musicState, isGM, token, gameId }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteStatus, setInviteStatus] = useState(null); // null | 'success' | 'notFound' | 'alreadyIn' | 'error'
  const [inviteLoading, setInviteLoading] = useState(false);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviteLoading(true);
    setInviteStatus(null);
    try {
      const response = await fetch(`${getApiUrl()}/games/${gameId}/invite`, {
        method: 'POST',
        headers: getApiHeaders({
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }),
        body: JSON.stringify({ email: inviteEmail.trim() })
      });
      if (response.ok) {
        setInviteStatus('success');
        setInviteEmail('');
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

  const toggleLanguage = () => {
    const newLang = i18n.language === 'en' ? 'pl' : 'en';
    i18n.changeLanguage(newLang);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    onLogout();
    navigate('/login');
  };

  return (
    <div className="general-tab">
      {/* Game Info Section */}
      <section className="general-tab__section">
        <h4 className="general-tab__section-title">{t('settings.gameInfo')}</h4>
        <div className="general-tab__game-info">
          <div className="general-tab__info-row">
            <span className="general-tab__label">{t('settings.gameName')}:</span>
            <span className="general-tab__value">{gameState?.name || 'Game Session'}</span>
          </div>
          <div className="general-tab__info-row">
            <span className="general-tab__label">{t('settings.gameMaster')}:</span>
            <span className="general-tab__value">
              {gameState?.gameMasterEmail || t('common.unknown')}
            </span>
          </div>
          <div className="general-tab__info-row">
            <span className="general-tab__label">{t('settings.connectionStatus')}:</span>
            <span className={`general-tab__status ${isConnected ? 'general-tab__status--connected' : 'general-tab__status--disconnected'}`}>
              {isConnected ? t('settings.connected') : t('settings.disconnected')}
            </span>
          </div>
          <div className="general-tab__info-row">
            <span className="general-tab__label">{t('settings.players')}:</span>
            <span className="general-tab__value">{gameState?.participants?.length || 0}</span>
          </div>
        </div>
      </section>

      {/* Invite Players Section (GM only) */}
      {isGM && (
        <section className="general-tab__section">
          <h4 className="general-tab__section-title">{t('settings.invitePlayers')}</h4>
          <div className="general-tab__invite">
            <input
              type="email"
              className="general-tab__invite-input"
              placeholder={t('settings.inviteByEmail')}
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !inviteLoading) handleInvite(); }}
              disabled={inviteLoading}
            />
            <button
              className="general-tab__invite-btn"
              onClick={handleInvite}
              disabled={inviteLoading || !inviteEmail.trim()}
            >
              {t('settings.invite')}
            </button>
          </div>
          {inviteStatus === 'success' && (
            <p className="general-tab__invite-msg general-tab__invite-msg--success">{t('settings.inviteSuccess')}</p>
          )}
          {inviteStatus === 'notFound' && (
            <p className="general-tab__invite-msg general-tab__invite-msg--error">{t('settings.inviteNotFound')}</p>
          )}
          {inviteStatus === 'alreadyIn' && (
            <p className="general-tab__invite-msg general-tab__invite-msg--error">{t('settings.inviteAlreadyInGame')}</p>
          )}
          {inviteStatus === 'error' && (
            <p className="general-tab__invite-msg general-tab__invite-msg--error">{t('common.error')}</p>
          )}
        </section>
      )}

      {/* Music Volume Section */}
      {playerVolume !== undefined && onPlayerVolumeChange && (
        <section className="general-tab__section">
          <h4 className="general-tab__section-title">{t('music.playerVolume')}</h4>
          {musicState?.trackName && (
            <div className="general-tab__now-playing">
              {musicState.isPlaying ? t('music.nowPlaying') : t('music.paused')}: {musicState.trackName}
            </div>
          )}
          <div className="general-tab__volume-control">
            <span className="general-tab__volume-icon">🔈</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={playerVolume}
              onChange={(e) => onPlayerVolumeChange(parseFloat(e.target.value))}
              className="general-tab__volume-slider"
            />
            <span className="general-tab__volume-icon">🔊</span>
            <span className="general-tab__volume-value">{Math.round(playerVolume * 100)}%</span>
          </div>
        </section>
      )}

      {/* Language Section */}
      <section className="general-tab__section">
        <h4 className="general-tab__section-title">{t('settings.language')}</h4>
        <button
          className="general-tab__language-btn"
          onClick={toggleLanguage}
        >
          {i18n.language === 'en' ? t('settings.english') : t('settings.polish')}
          <span className="general-tab__language-toggle">
            {i18n.language === 'en' ? 'EN' : 'PL'}
          </span>
        </button>
      </section>

      {/* Actions Section */}
      <section className="general-tab__section">
        <h4 className="general-tab__section-title">{t('settings.actions')}</h4>
        <div className="general-tab__actions">
          <button
            className="general-tab__action-btn general-tab__action-btn--back"
            onClick={onGoToGameList}
          >
            <ArrowBackIcon fontSize="small" />
            {t('settings.backToGameList')}
          </button>
          <button
            className="general-tab__action-btn general-tab__action-btn--leave"
            onClick={onLeaveGame}
          >
            <ExitToAppIcon fontSize="small" />
            {t('settings.leaveGame')}
          </button>
          <button
            className="general-tab__action-btn general-tab__action-btn--logout"
            onClick={handleLogout}
          >
            <LogoutIcon fontSize="small" />
            {t('settings.logout')}
          </button>
        </div>
      </section>
    </div>
  );
};

export default GeneralTab;
