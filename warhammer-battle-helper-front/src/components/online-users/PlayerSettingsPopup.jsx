import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import axiosInstance from '../../api/axios';
import { getProfile, updateGameParticipant } from '../../api/profile';
import AvatarUpload from '../character-sheet/AvatarUpload';
import { getAvatarUrl } from '../Avatar';
import CloseIcon from '@mui/icons-material/Close';
import './PlayerSettingsPopup.css';

const PlayerSettingsPopup = ({ isOpen, onClose, gameId, participants, onParticipantUpdated }) => {
  const { t } = useTranslation();

  const [userProfile, setUserProfile] = useState(null);
  const [playerAvatar, setPlayerAvatar] = useState('');       // own uploaded avatar
  const [avatarCharacterUrl, setAvatarCharacterUrl] = useState(''); // resolved character avatar URL
  const [avatarType, setAvatarType] = useState('upload'); // 'upload' | 'character'
  const [avatarCharacterId, setAvatarCharacterId] = useState('');
  const [signatureType, setSignatureType] = useState('account');
  const [selectedCharacterId, setSelectedCharacterId] = useState('');
  const [customSignature, setCustomSignature] = useState('');
  const [characters, setCharacters] = useState(null);
  const [avatarSize, setAvatarSize] = useState('small');
  const [showSignature, setShowSignature] = useState(false);
  const [playerSaving, setPlayerSaving] = useState(false);
  const [playerSaveSuccess, setPlayerSaveSuccess] = useState(false);
  const [playerSaveError, setPlayerSaveError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setPlayerSaveSuccess(false);
    setPlayerSaveError('');
    setCharacters(null);
    getProfile().then(profile => {
      setUserProfile(profile);
      if (participants) {
        const me = participants.find(p => p.userId === profile.user_id);
        if (me) {
          setPlayerAvatar(me.avatar || '');
          setAvatarCharacterUrl(me.avatarCharacterUrl || '');
          setAvatarSize(me.avatarSize || 'small');
          setShowSignature(!!me.showSignature);
          const type = me.avatarType || 'upload';
          setAvatarType(type);
          setAvatarCharacterId(me.avatarCharacterId || '');
          if (type === 'character' && me.avatarCharacterId) {
            axiosInstance.get(`/games/${gameId}/characters`)
              .then(res => setCharacters(res.data || []))
              .catch(() => setCharacters([]));
          }
          if (me.signature) {
            setCustomSignature(me.signature);
            setSignatureType('custom');
          } else {
            setSignatureType('account');
          }
        }
      }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, gameId]);

  const loadCharacters = () => {
    if (characters === null) {
      axiosInstance.get(`/games/${gameId}/characters`)
        .then(res => setCharacters(res.data || []))
        .catch(() => setCharacters([]));
    }
  };

  const handleAvatarTypeChange = (type) => {
    setAvatarType(type);
    setPlayerSaveSuccess(false);
    if (type === 'character') loadCharacters();
  };

  const handleSignatureTypeChange = (type) => {
    setSignatureType(type);
    setPlayerSaveSuccess(false);
    if (type === 'character') loadCharacters();
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
      await updateGameParticipant(gameId, {
        avatar: playerAvatar,
        avatarType,
        avatarCharacterId: avatarType === 'character' ? avatarCharacterId : '',
        signature: resolveSignatureToSave(),
        avatarSize,
        showSignature,
      });
      setPlayerSaveSuccess(true);
      if (onParticipantUpdated) onParticipantUpdated();
    } catch {
      setPlayerSaveError(t('common.error'));
    } finally {
      setPlayerSaving(false);
    }
  };

  const avatarCharacter = avatarType === 'character'
    ? (characters || []).find(c => c.id === avatarCharacterId)
    : null;
  // Use server-cached URL only while characters are still loading (characters === null)
  const avatarPreviewUrl = characters !== null
    ? (avatarCharacter?.avatar || '')
    : (avatarType === 'character' ? avatarCharacterUrl : '');

  if (!isOpen) return null;

  return createPortal(
    <div className="player-settings-popup__overlay" onClick={onClose}>
      <div className="player-settings-popup" onClick={e => e.stopPropagation()}>
        <div className="player-settings-popup__header">
          <h2 className="player-settings-popup__title">{t('game.player.title')}</h2>
          <button className="player-settings-popup__close" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </button>
        </div>

        <div className="player-settings-popup__body">
          <div className="player-settings-popup__field-label">{t('game.player.avatar')}</div>

          <div className="player-settings-popup__sig-options">
            <label className="player-settings-popup__sig-option">
              <input type="radio" name="psp-avatarType" value="upload"
                checked={avatarType === 'upload'}
                onChange={() => handleAvatarTypeChange('upload')}
              />
              {t('game.player.avatarType.upload')}
            </label>
            <label className="player-settings-popup__sig-option">
              <input type="radio" name="psp-avatarType" value="character"
                checked={avatarType === 'character'}
                onChange={() => handleAvatarTypeChange('character')}
              />
              {t('game.player.avatarType.character')}
            </label>
            <label className="player-settings-popup__sig-option">
              <input type="radio" name="psp-avatarType" value="account"
                checked={avatarType === 'account'}
                onChange={() => handleAvatarTypeChange('account')}
              />
              {t('game.player.avatarType.account')}
            </label>
          </div>

          {avatarType === 'upload' && (
            <AvatarUpload
              currentAvatar={playerAvatar}
              onAvatarChange={url => { setPlayerAvatar(url); setPlayerSaveSuccess(false); }}
            />
          )}

          {avatarType === 'character' && (
            <div className="player-settings-popup__avatar-character">
              <select
                className="player-settings-popup__select"
                value={avatarCharacterId}
                onChange={e => { setAvatarCharacterId(e.target.value); setPlayerSaveSuccess(false); }}
              >
                <option value="">{t('game.player.characterPlaceholder')}</option>
                {(characters || []).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {avatarPreviewUrl ? (
                <img
                  src={getAvatarUrl(avatarPreviewUrl)}
                  alt={avatarCharacter?.name || ''}
                  className="player-settings-popup__avatar-preview"
                />
              ) : avatarCharacterId && (
                <p className="player-settings-popup__avatar-hint">{t('game.player.noCharacterAvatar')}</p>
              )}
            </div>
          )}

          {avatarType === 'account' && (
            userProfile?.avatar ? (
              <img
                src={getAvatarUrl(userProfile.avatar)}
                alt=""
                className="player-settings-popup__avatar-preview"
              />
            ) : (
              <p className="player-settings-popup__avatar-hint">{t('game.player.noAccountAvatar')}</p>
            )
          )}


          <div className="player-settings-popup__field-label">{t('game.player.signature')}</div>
          <div className="player-settings-popup__sig-options">
            <label className="player-settings-popup__sig-option">
              <input
                type="radio"
                name="psp-sigType"
                value="account"
                checked={signatureType === 'account'}
                onChange={() => handleSignatureTypeChange('account')}
              />
              {t('game.player.signatureType.account')}
              {signatureType === 'account' && (
                <span className="player-settings-popup__sig-preview">
                  → {userProfile?.signature || userProfile?.email || ''}
                </span>
              )}
            </label>

            <label className="player-settings-popup__sig-option">
              <input
                type="radio"
                name="psp-sigType"
                value="character"
                checked={signatureType === 'character'}
                onChange={() => handleSignatureTypeChange('character')}
              />
              {t('game.player.signatureType.character')}
            </label>
            {signatureType === 'character' && (
              <select
                className="player-settings-popup__select"
                value={selectedCharacterId}
                onChange={e => setSelectedCharacterId(e.target.value)}
              >
                <option value="">{t('game.player.characterPlaceholder')}</option>
                {(characters || []).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}

            <label className="player-settings-popup__sig-option">
              <input
                type="radio"
                name="psp-sigType"
                value="custom"
                checked={signatureType === 'custom'}
                onChange={() => handleSignatureTypeChange('custom')}
              />
              {t('game.player.signatureType.custom')}
            </label>
            {signatureType === 'custom' && (
              <input
                type="text"
                className="player-settings-popup__input"
                value={customSignature}
                onChange={e => { setCustomSignature(e.target.value); setPlayerSaveSuccess(false); }}
                placeholder={t('game.player.customPlaceholder')}
                maxLength={50}
              />
            )}
          </div>

          <div className="player-settings-popup__field-label">{t('game.player.bubbleSize')}</div>
          <select
              className="player-settings-popup__select"
              value={avatarSize}
              onChange={e => { setAvatarSize(e.target.value); setPlayerSaveSuccess(false); }}
          >
            {['small', 'medium', 'big'].map(size => (
                <option key={size} value={size}>{t(`game.player.bubbleSizes.${size}`)}</option>
            ))}
          </select>

          <label className="player-settings-popup__checkbox">
            <input
                type="checkbox"
                checked={showSignature}
                onChange={e => { setShowSignature(e.target.checked); setPlayerSaveSuccess(false); }}
            />
            {t('game.player.showSignature')}
          </label>

          {playerSaveError && <p className="player-settings-popup__msg player-settings-popup__msg--error">{playerSaveError}</p>}
          {playerSaveSuccess && <p className="player-settings-popup__msg player-settings-popup__msg--success">{t('game.player.successMessage')}</p>}
        </div>

        <div className="player-settings-popup__footer">
          <button
            className="player-settings-popup__save-btn"
            onClick={handlePlayerSave}
            disabled={playerSaving}
          >
            {playerSaving ? t('game.player.saving') : t('game.player.save')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default PlayerSettingsPopup;
