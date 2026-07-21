import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import GridOnIcon from '@mui/icons-material/GridOn';
import GridOffIcon from '@mui/icons-material/GridOff';
import StraightenIcon from '@mui/icons-material/Straighten';
import Grid3x3Icon from '@mui/icons-material/Grid3x3';
import AltRouteIcon from '@mui/icons-material/AltRoute';
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

// Icon per distance metric (Grid3x3 for chebyshev, not GridOn — that one marks snap placement).
const METRIC_ICONS = { euclidean: StraightenIcon, chebyshev: Grid3x3Icon, alternating: AltRouteIcon };

// Distance units for the cell-size config (same set as Roll20). 'custom' → free-text label.
const DISTANCE_UNITS = ['ft', 'm', 'km', 'mi', 'in', 'cm', 'un', 'hex', 'sq', 'custom'];

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

  // Per-game map rules (snap/free placement + distance metric). GM-only. The PATCH broadcasts
  // GAME_MAP_SETTINGS_UPDATED, so every client refetches — no optimistic local state needed.
  const placementMode = gameState?.mapSettings?.tokenPlacementMode || 'snap';
  const measurementMetric = gameState?.mapSettings?.measurementMetric || 'euclidean';
  const cellDistance = gameState?.mapSettings?.cellDistance || 5;
  const distanceUnit = gameState?.mapSettings?.distanceUnit || 'ft';
  const customUnit = gameState?.mapSettings?.customUnit || '';

  const updateMapSettings = async (patch) => {
    try {
      await fetch(`${getApiUrl()}/games/${gameId}/mapSettings`, {
        method: 'PATCH',
        headers: getApiHeaders({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }),
        body: JSON.stringify(patch),
      });
    } catch { /* ignore — WS broadcast refreshes state */ }
  };

  // Text/number inputs commit on blur (not per keystroke) — draft state synced from server value.
  const [cellDraft, setCellDraft] = useState(String(cellDistance));
  useEffect(() => { setCellDraft(String(cellDistance)); }, [cellDistance]);
  const [customDraft, setCustomDraft] = useState(customUnit);
  useEffect(() => { setCustomDraft(customUnit); }, [customUnit]);

  const commitCellDistance = () => {
    const v = parseFloat(cellDraft);
    if (!Number.isNaN(v) && v > 0) updateMapSettings({ cellDistance: v });
    else setCellDraft(String(cellDistance)); // revert invalid input
  };
  const commitCustomUnit = () => updateMapSettings({ customUnit: customDraft.trim() });

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

      {/* Map Settings — GM only. Shared session rules for the scene map. */}
      {isGM && (
        <section className="general-tab__section">
          <h4 className="general-tab__section-title">{t('map.tokenPositioning')}</h4>
          <div className="map-settings-toggle" role="radiogroup" aria-label={t('map.tokenPositioning')}>
            <button
              type="button"
              role="radio"
              aria-checked={placementMode === 'snap'}
              className={`map-settings-toggle__option${placementMode === 'snap' ? ' map-settings-toggle__option--active' : ''}`}
              onClick={() => updateMapSettings({ tokenPlacementMode: 'snap' })}
            >
              <GridOnIcon fontSize="small" />
              {t('map.snapToGrid')}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={placementMode === 'free'}
              className={`map-settings-toggle__option${placementMode === 'free' ? ' map-settings-toggle__option--active' : ''}`}
              onClick={() => updateMapSettings({ tokenPlacementMode: 'free' })}
            >
              <GridOffIcon fontSize="small" />
              {t('map.freeform')}
            </button>
          </div>

          <h4 className="general-tab__section-title" style={{ marginTop: 16 }}>{t('map.distanceMeasurement')}</h4>
          <div className="map-settings-toggle map-settings-toggle--vertical" role="radiogroup" aria-label={t('map.distanceMeasurement')}>
            {['euclidean', 'chebyshev', 'alternating'].map(metric => {
              const Icon = METRIC_ICONS[metric];
              return (
                <button
                  key={metric}
                  type="button"
                  role="radio"
                  aria-checked={measurementMetric === metric}
                  className={`map-settings-toggle__option${measurementMetric === metric ? ' map-settings-toggle__option--active' : ''}`}
                  onClick={() => updateMapSettings({ measurementMetric: metric })}
                >
                  <Icon fontSize="small" />
                  {t(`map.metric.${metric}`)}
                </button>
              );
            })}
          </div>

          <h4 className="general-tab__section-title" style={{ marginTop: 16 }}>{t('map.cellSize')}</h4>
          <div className="map-cell-size">
            <span className="map-cell-size__prefix">{t('map.oneCellEquals')}</span>
            <input
              type="number"
              min="0"
              step="0.5"
              className="map-cell-size__value"
              value={cellDraft}
              onChange={(e) => setCellDraft(e.target.value)}
              onBlur={commitCellDistance}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            />
            <select
              className="map-cell-size__unit"
              value={distanceUnit}
              onChange={(e) => updateMapSettings({ distanceUnit: e.target.value })}
            >
              {DISTANCE_UNITS.map(u => (
                <option key={u} value={u}>{u === 'custom' ? t('map.unitCustom') : u}</option>
              ))}
            </select>
          </div>
          {distanceUnit === 'custom' && (
            <input
              type="text"
              className="map-cell-size__custom"
              placeholder={t('map.customUnitPlaceholder')}
              value={customDraft}
              onChange={(e) => setCustomDraft(e.target.value)}
              onBlur={commitCustomUnit}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            />
          )}
        </section>
      )}

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
