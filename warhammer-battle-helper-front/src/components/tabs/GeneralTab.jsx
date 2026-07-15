import React, { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import Cropper from 'react-easy-crop';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import LogoutIcon from '@mui/icons-material/Logout';
import VolumeDownIcon from '@mui/icons-material/VolumeDown';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import TuneIcon from '@mui/icons-material/Tune';
import ImageIcon from '@mui/icons-material/Image';
import DeleteIcon from '@mui/icons-material/Delete';
import ControlSchemeSelector from '../scene/ControlSchemeSelector';
import { resolveDisplayName } from '../../utils/participants';
import { getApiUrl, getApiHeaders } from '../../api/axios';
import { getAvatarUrl } from '../Avatar';
import RollStatsPanel from './RollStatsPanel';
import TemplateBuilder from '../creator/TemplateBuilder';
import './GeneralTab.css';

// Aspect ratio of the lobby tile image zone (tarot card layout in GameLobby)
export const GAME_IMAGE_ASPECT = 5 / 4;

// Crops the source image (data URL) to the given pixel area and returns a JPEG blob.
// Output is downscaled to at most 800px wide — plenty for a lobby tile.
const cropImageToBlob = (src, area) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => {
    const maxWidth = 800;
    const scale = Math.min(1, maxWidth / area.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(area.width * scale);
    canvas.height = Math.round(area.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('crop failed'))), 'image/jpeg', 0.85);
  };
  img.onerror = reject;
  img.src = src;
});

/**
 * General settings tab - contains game info, language settings, and actions
 */
const GeneralTab = ({ onLogout, onGoToGameList, gameState, isConnected, playerVolume, onPlayerVolumeChange, musicState, controlScheme, onControlSchemeChange, gameId, token, isGM = false }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [statsOpen, setStatsOpen] = useState(true);
  const [tokenTemplate, setTokenTemplate] = useState(null); // token config being edited in-game

  // Game image (lobby tile) — GM only
  const [cropSrc, setCropSrc] = useState(null); // data URL of the picked file being cropped
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [imageBusy, setImageBusy] = useState(false);
  const fileInputRef = useRef(null);

  // Token display is a per-user singleton per hardcoded system (one "my Warhammer
  // tokens"). Custom games carry their own full template, so they configure tokens in
  // the creator instead. Only the GM configures it.
  const canConfigureTokens = isGM && !!gameState?.gameSystem && gameState.gameSystem !== 'custom';

  // Open (creating on first use) the user's single token config for this system. On
  // close, publish broadcasts the change so every game of this system updates live.
  const openTokenConfig = async () => {
    if (!canConfigureTokens) return;
    try {
      const res = await fetch(`${getApiUrl()}/systems/${gameState.gameSystem}/tokenConfig`, {
        method: 'POST',
        headers: getApiHeaders({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }),
        body: '{}',
      });
      if (!res.ok) return;
      setTokenTemplate(await res.json());
    } catch { /* ignore */ }
  };

  const closeTokenConfig = async () => {
    setTokenTemplate(null);
    try {
      await fetch(`${getApiUrl()}/systems/${gameState.gameSystem}/tokenConfig/publish`, {
        method: 'POST',
        headers: getApiHeaders({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }),
        body: '{}',
      });
    } catch { /* ignore */ }
  };

  const onImageFileSelected = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same file again later
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      setCropSrc(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const onCropComplete = useCallback((_croppedArea, areaPixels) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const uploadCroppedImage = async () => {
    if (!cropSrc || !croppedAreaPixels) return;
    setImageBusy(true);
    try {
      const blob = await cropImageToBlob(cropSrc, croppedAreaPixels);
      const form = new FormData();
      form.append('image', blob, 'game-image.jpg');
      const res = await fetch(`${getApiUrl()}/games/${gameId}/image`, {
        method: 'POST',
        // No Content-Type here — the browser sets the multipart boundary itself.
        headers: getApiHeaders({ Authorization: `Bearer ${token}` }),
        body: form,
      });
      if (res.ok) setCropSrc(null); // game state refreshes via WS broadcast
    } catch { /* ignore */ } finally {
      setImageBusy(false);
    }
  };

  const removeGameImage = async () => {
    setImageBusy(true);
    try {
      await fetch(`${getApiUrl()}/games/${gameId}/image`, {
        method: 'DELETE',
        headers: getApiHeaders({ Authorization: `Bearer ${token}` }),
      });
    } catch { /* ignore */ } finally {
      setImageBusy(false);
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
              {resolveDisplayName(gameState?.participants?.find(p => p.userId === gameState.gameMasterId)) || gameState?.gameMasterEmail || t('common.unknown')}
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
        {canConfigureTokens && (
          <button className="general-tab__action-btn general-tab__action-btn--back" onClick={openTokenConfig} style={{ marginTop: 8 }}>
            <TuneIcon fontSize="small" />
            {t('creator.tokenDisplay.configureButton')}
          </button>
        )}
      </section>

      {/* Game Image Section — GM only, shown on the lobby tile */}
      {isGM && (
        <section className="general-tab__section">
          <h4 className="general-tab__section-title">{t('settings.gameImage')}</h4>
          <div className="general-tab__game-image">
            {gameState?.imageUrl ? (
              <img
                src={getAvatarUrl(gameState.imageUrl)}
                alt={t('settings.gameImage')}
                className="general-tab__game-image-preview"
              />
            ) : (
              <div className="general-tab__game-image-placeholder">
                <ImageIcon fontSize="large" />
                <span>{t('settings.gameImageNone')}</span>
              </div>
            )}
            <div className="general-tab__actions">
              <button
                className="general-tab__action-btn general-tab__action-btn--back"
                onClick={() => fileInputRef.current?.click()}
                disabled={imageBusy}
              >
                <ImageIcon fontSize="small" />
                {gameState?.imageUrl ? t('settings.gameImageChange') : t('settings.gameImageAdd')}
              </button>
              {gameState?.imageUrl && (
                <button
                  className="general-tab__action-btn general-tab__action-btn--logout"
                  onClick={removeGameImage}
                  disabled={imageBusy}
                >
                  <DeleteIcon fontSize="small" />
                  {t('settings.gameImageDelete')}
                </button>
              )}
            </div>
            <p className="general-tab__game-image-hint">{t('settings.gameImageHint')}</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={onImageFileSelected}
            />
          </div>
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

      {/* Roll Statistics Section */}
      <section className="general-tab__section general-tab__section--collapsible">
        <button
          className="general-tab__section-header"
          onClick={() => setStatsOpen(o => !o)}
          aria-expanded={statsOpen}
        >
          <h4 className="general-tab__section-title">{t('stats.statistics')}</h4>
          {statsOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </button>
        {statsOpen && <RollStatsPanel gameId={gameId} token={token} />}
      </section>

      {/* Scene Controls Section */}
      <section className="general-tab__section">
        <h4 className="general-tab__section-title">{t('settings.controlScheme')}</h4>
        <ControlSchemeSelector value={controlScheme || 'modern'} onChange={onControlSchemeChange} />
      </section>

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

      {/* Game image cropper overlay */}
      {cropSrc && (
        <div className="game-image-cropper__overlay">
          <div className="game-image-cropper">
            <h4 className="game-image-cropper__title">{t('settings.gameImageCropTitle')}</h4>
            <div className="game-image-cropper__area">
              <Cropper
                image={cropSrc}
                crop={crop}
                zoom={zoom}
                aspect={GAME_IMAGE_ASPECT}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>
            <div className="game-image-cropper__zoom">
              <input
                type="range"
                min="1"
                max="3"
                step="0.05"
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="general-tab__volume-slider"
                aria-label={t('settings.gameImageZoom')}
              />
            </div>
            <div className="game-image-cropper__actions">
              <button
                className="general-tab__action-btn general-tab__action-btn--back"
                onClick={() => setCropSrc(null)}
                disabled={imageBusy}
              >
                {t('common.cancel')}
              </button>
              <button
                className="general-tab__action-btn general-tab__action-btn--logout"
                onClick={uploadCroppedImage}
                disabled={imageBusy || !croppedAreaPixels}
              >
                {imageBusy ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {tokenTemplate && (
        <TemplateBuilder
          template={tokenTemplate}
          token={token}
          onClose={closeTokenConfig}
          onTemplateUpdated={(updated) => { if (updated?.id) setTokenTemplate(updated); }}
        />
      )}
    </div>
  );
};

export default GeneralTab;
