import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { getApiUrl, getApiHeaders } from '../../api/axios';
import axiosInstance from '../../api/axios';
import { getProfile, updateGameParticipant } from '../../api/profile';
import AvatarUpload from '../character-sheet/AvatarUpload';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import LogoutIcon from '@mui/icons-material/Logout';
import VolumeDownIcon from '@mui/icons-material/VolumeDown';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import './GeneralTab.css';

/**
 * General settings tab - contains game info, language settings, and actions
 */
const GeneralTab = ({ onLogout, onLeaveGame, onGoToGameList, gameState, isConnected, playerVolume, onPlayerVolumeChange, musicState, isGM, token, gameId, onParticipantUpdated }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteStatus, setInviteStatus] = useState(null); // null | 'success' | 'notFound' | 'alreadyIn' | 'error'
  const [inviteLoading, setInviteLoading] = useState(false);

  // Player section state
  const [userProfile, setUserProfile] = useState(null);
  const [playerAvatar, setPlayerAvatar] = useState('');
  const [signatureType, setSignatureType] = useState('account'); // 'account' | 'character' | 'custom'
  const [selectedCharacterId, setSelectedCharacterId] = useState('');
  const [customSignature, setCustomSignature] = useState('');
  const [characters, setCharacters] = useState(null); // lazy loaded
  const [avatarSize, setAvatarSize] = useState('small');
  const [showSignature, setShowSignature] = useState(false);
  const [playerSaving, setPlayerSaving] = useState(false);
  const [playerSaveSuccess, setPlayerSaveSuccess] = useState(false);
  const [playerSaveError, setPlayerSaveError] = useState('');

  useEffect(() => {
    getProfile().then(profile => {
      setUserProfile(profile);
      // Find current participant in gameState to pre-fill
      if (gameState?.participants) {
        const me = gameState.participants.find(p => p.userId === profile.user_id);
        if (me) {
          setPlayerAvatar(me.avatar || '');
          setAvatarSize(me.avatarSize || 'small');
          setShowSignature(!!me.showSignature);
          if (me.signature) {
            setCustomSignature(me.signature);
            setSignatureType('custom');
          }
        }
      }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  const handleSignatureTypeChange = (type) => {
    setSignatureType(type);
    setPlayerSaveSuccess(false);
    if (type === 'character' && characters === null) {
      axiosInstance.get(`/games/${gameId}/characters`)
        .then(res => setCharacters(res.data || []))
        .catch(() => setCharacters([]));
    }
  };

  const resolveSignatureToSave = () => {
    if (signatureType === 'account') return '';
    if (signatureType === 'character') {
      const char = (characters || []).find(c => c.id === selectedCharacterId);
      return char ? char.name : '';
    }
    return customSignature.trim();
  };

  const handlePlayerSave = async () => {
    setPlayerSaving(true);
    setPlayerSaveSuccess(false);
    setPlayerSaveError('');
    try {
      await updateGameParticipant(gameId, { avatar: playerAvatar, signature: resolveSignatureToSave(), avatarSize, showSignature });
      setPlayerSaveSuccess(true);
      if (onParticipantUpdated) onParticipantUpdated();
    } catch {
      setPlayerSaveError(t('common.error'));
    } finally {
      setPlayerSaving(false);
    }
  };

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
            <span className="general-tab__value">{gameState?.participants?.filter(p => p.role !== 'gm').length || 0}</span>
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

      {/* Player Section */}
      <section className="general-tab__section">
        <h4 className="general-tab__section-title">{t('game.player.title')}</h4>
        <div className="general-tab__player-avatar-label">{t('game.player.avatar')}</div>
        <AvatarUpload
          currentAvatar={playerAvatar}
          onAvatarChange={url => { setPlayerAvatar(url); setPlayerSaveSuccess(false); }}
        />

        <div className="general-tab__player-sig-label">{t('game.player.bubbleSize')}</div>
        <select
          className="general-tab__player-sig-select"
          value={avatarSize}
          onChange={e => { setAvatarSize(e.target.value); setPlayerSaveSuccess(false); }}
        >
          {['small', 'medium', 'big'].map(size => (
            <option key={size} value={size}>{t(`game.player.bubbleSizes.${size}`)}</option>
          ))}
        </select>

        <label className="general-tab__player-checkbox">
          <input
            type="checkbox"
            checked={showSignature}
            onChange={e => { setShowSignature(e.target.checked); setPlayerSaveSuccess(false); }}
          />
          {t('game.player.showSignature')}
        </label>

        <div className="general-tab__player-sig-label">{t('game.player.signature')}</div>
        <div className="general-tab__player-sig-options">
          <label className="general-tab__player-sig-option">
            <input
              type="radio"
              name="sigType"
              value="account"
              checked={signatureType === 'account'}
              onChange={() => handleSignatureTypeChange('account')}
            />
            {t('game.player.signatureType.account')}
            {signatureType === 'account' && (
              <span className="general-tab__player-sig-preview">
                → {userProfile?.signature || userProfile?.email || ''}
              </span>
            )}
          </label>

          <label className="general-tab__player-sig-option">
            <input
              type="radio"
              name="sigType"
              value="character"
              checked={signatureType === 'character'}
              onChange={() => handleSignatureTypeChange('character')}
            />
            {t('game.player.signatureType.character')}
          </label>
          {signatureType === 'character' && (
            <select
              className="general-tab__player-sig-select"
              value={selectedCharacterId}
              onChange={e => setSelectedCharacterId(e.target.value)}
            >
              <option value="">{t('game.player.characterPlaceholder')}</option>
              {(characters || []).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}

          <label className="general-tab__player-sig-option">
            <input
              type="radio"
              name="sigType"
              value="custom"
              checked={signatureType === 'custom'}
              onChange={() => handleSignatureTypeChange('custom')}
            />
            {t('game.player.signatureType.custom')}
          </label>
          {signatureType === 'custom' && (
            <input
              type="text"
              className="general-tab__player-sig-input"
              value={customSignature}
              onChange={e => { setCustomSignature(e.target.value); setPlayerSaveSuccess(false); }}
              placeholder={t('game.player.customPlaceholder')}
              maxLength={50}
            />
          )}
        </div>

        {playerSaveError && <p className="general-tab__player-msg general-tab__player-msg--error">{playerSaveError}</p>}
        {playerSaveSuccess && <p className="general-tab__player-msg general-tab__player-msg--success">{t('game.player.successMessage')}</p>}

        <button
          className="general-tab__player-save-btn"
          onClick={handlePlayerSave}
          disabled={playerSaving}
        >
          {playerSaving ? t('game.player.saving') : t('game.player.save')}
        </button>
      </section>

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
            <span className="general-tab__volume-icon"><VolumeDownIcon fontSize="inherit" /></span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={playerVolume}
              onChange={(e) => onPlayerVolumeChange(parseFloat(e.target.value))}
              className="general-tab__volume-slider"
            />
            <span className="general-tab__volume-icon"><VolumeUpIcon fontSize="inherit" /></span>
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
      {/* Logo */}
      <div className="general-tab__logo">
        <img src="/img/logo.png" alt="Warhammer Battle Helper" className="general-tab__logo-img" />
      </div>
    </div>
  );
};

export default GeneralTab;
