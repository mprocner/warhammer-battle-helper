import React from 'react';
import { useTranslation } from 'react-i18next';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import BrushIcon from '@mui/icons-material/Brush';
import HorizontalRuleIcon from '@mui/icons-material/HorizontalRule';
import CropSquareIcon from '@mui/icons-material/CropSquare';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import PolylineIcon from '@mui/icons-material/Polyline';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import AdsClickIcon from '@mui/icons-material/AdsClick';
import BlurCircularIcon from '@mui/icons-material/BlurCircular';
import UndoIcon from '@mui/icons-material/Undo';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import FoggyIcon from '@mui/icons-material/Foggy';
import WbSunnyIcon from '@mui/icons-material/WbSunny';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import NotInterestedIcon from '@mui/icons-material/NotInterested';
import BorderColorIcon from '@mui/icons-material/BorderColor';
import FormatColorFillIcon from '@mui/icons-material/FormatColorFill';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import { modesForRole } from './sceneModes';
import { TEXT_FONTS, TEXT_FONT_SIZE_MAX, TEXT_FONT_SIZE_MIN } from './drawingText';
import './DrawingToolbar.css';

const PRESET_COLORS = ['#000000', '#ff0000', '#00c853', '#2979ff', '#ffea00', '#ffffff'];

const TEXT_BACKDROP_OPTIONS = [
  { value: 'none', Icon: NotInterestedIcon, labelKey: 'scenes.textBackdrop_none' },
  { value: 'outline', Icon: BorderColorIcon, labelKey: 'scenes.textBackdrop_outline' },
  { value: 'box', Icon: FormatColorFillIcon, labelKey: 'scenes.textBackdrop_box' },
];

// Text-section buttons must not take focus: the open label field saves itself on blur, and a
// click on B / I / backdrop is styling that very label (see DrawingTextField).
const keepFocus = (e) => e.preventDefault();

// fogCompat: true → narzędzie widoczne w trybie mgły; false → ukryte w fog mode
// fogOnly: true → narzędzie widoczne TYLKO w trybie mgły (ukryte w trybie rysowania)
const TOOLS = [
  { value: 'freehand', Icon: BrushIcon,               labelKey: 'scenes.drawingTool_freehand', fogCompat: true  },
  { value: 'line',     Icon: HorizontalRuleIcon,       labelKey: 'scenes.drawingTool_line',     fogCompat: true  },
  { value: 'rect',     Icon: CropSquareIcon,           labelKey: 'scenes.drawingTool_rect',     fogCompat: true  },
  { value: 'circle',   Icon: RadioButtonUncheckedIcon, labelKey: 'scenes.drawingTool_circle',   fogCompat: true  },
  { value: 'polygon',  Icon: PolylineIcon,             labelKey: 'scenes.drawingTool_polygon',  fogCompat: true,  fogOnly: true },
  { value: 'arrow',    Icon: ArrowForwardIcon,         labelKey: 'scenes.drawingTool_arrow',    fogCompat: false },
  { value: 'text',     Icon: TextFieldsIcon,           labelKey: 'scenes.drawingTool_text',     fogCompat: false },
  { value: 'select',   Icon: AdsClickIcon,             labelKey: 'scenes.drawingTool_select',   fogCompat: false },
];

const DrawingToolbar = ({
  editingLayer,
  onEditingLayerChange,
  fogCoverMode = false,
  onFogCoverModeChange,
  aoeEnabled = true,
  onAoeToggle,
  activeTool,
  onActiveToolChange,
  brushSize,
  onBrushSizeChange,
  fogGmOpacity = 0.5,
  onFogGmOpacityChange,
  drawingColor,
  onDrawingColorChange,
  showTextControls = false,
  textStyle,
  onTextStyleChange,
  textBackdropColor,
  onUndoDrawing,
  onClearDrawing,
  onUndoFog,
  onClearFog,
  onRevealAllFog,
  selectedPathId,
  onDeleteSelected,
  isGM,
  canUndo,
  canUndoFog,
  trailing,
}) => {
  const { t } = useTranslation();
  const isActive = editingLayer === 'drawing' || editingLayer === 'fog';
  const isFogMode = editingLayer === 'fog';

  const handleUndo = isFogMode ? onUndoFog : onUndoDrawing;
  const handleClear = isFogMode ? onClearFog : onClearDrawing;
  const undoEnabled = isFogMode ? !!canUndoFog : !!canUndo;

  return (
    <div className="drawing-toolbar">
      {/* Mode tabs — rendered from sceneModes so the toolbar and the middle-click
          cycle can never disagree about which modes exist or in what order. */}
      <div className="drawing-toolbar__tabs">
        {modesForRole(isGM).map(({ value, Icon, labelKey }) => (
          <button
            key={value}
            className={`drawing-toolbar__tab ${editingLayer === value ? 'drawing-toolbar__tab--active' : ''}`}
            onClick={() => onEditingLayerChange(editingLayer === value ? 'select' : value)}
            aria-pressed={editingLayer === value}
          >
            <Icon style={{ fontSize: 22 }} />
            <span className="drawing-toolbar__tooltip">{t(labelKey)}</span>
          </button>
        ))}
        {/* Non-mode toggles (the combat tracker) render at the end and draw their own separator. */}
        {trailing}
      </div>

      {/* Measure-tool options — AoE circle toggle. */}
      {editingLayer === 'measure' && (
        <div className="drawing-toolbar__controls">
          <button
            className={`drawing-toolbar__aoe-toggle ${aoeEnabled ? 'drawing-toolbar__aoe-toggle--on' : ''}`}
            onClick={onAoeToggle}
            role="switch"
            aria-checked={aoeEnabled}
          >
            <BlurCircularIcon style={{ fontSize: 18 }} />
            <span>{t('scenes.measureAoe')}</span>
          </button>
        </div>
      )}

      {/* Expanded controls */}
      {isActive && (
        <div className="drawing-toolbar__controls">
          {/* Tool buttons — fog-incompatible tools hidden in fog mode */}
          <div className="drawing-toolbar__tools">
            {TOOLS.filter(({ fogCompat, fogOnly }) => isFogMode ? fogCompat : !fogOnly).map(({ value, Icon, labelKey }) => (
              <button
                key={value}
                className={`drawing-toolbar__tool ${activeTool === value ? 'drawing-toolbar__tool--active' : ''}`}
                onClick={() => onActiveToolChange(value)}
              >
                <Icon style={{ fontSize: 20 }} />
                <span className="drawing-toolbar__tooltip">{t(labelKey)}</span>
              </button>
            ))}
          </div>

          {/* Reveal / Cover toggle — only in fog mode */}
          {isFogMode && (
            <ToggleButtonGroup
              value={fogCoverMode ? 'cover' : 'reveal'}
              exclusive
              onChange={(_, val) => val && onFogCoverModeChange(val === 'cover')}
              size="small"
              fullWidth
              sx={{
                '& .MuiToggleButton-root': {
                  flex: 1,
                  border: '1px solid var(--c-border-light)',
                  color: 'var(--c-heading)',
                  fontFamily: 'var(--font-display)',
                  fontSize: '11px',
                  padding: '4px 6px',
                  gap: '4px',
                  background: 'linear-gradient(135deg, var(--c-surface-raised) 0%, var(--c-surface) 100%)',
                  textTransform: 'none',
                  '&.Mui-selected': {
                    background: 'linear-gradient(135deg, var(--c-accent-bg) 0%, var(--c-accent-bg-dark) 100%)',
                    color: 'var(--c-text-on-dark)',
                    borderColor: 'var(--c-border-strong)',
                    '&:hover': {
                      background: 'linear-gradient(135deg, var(--c-accent-bg-light) 0%, var(--c-accent-bg) 100%)',
                    },
                  },
                  '&:hover': {
                    background: 'linear-gradient(135deg, var(--c-surface-white) 0%, var(--c-input-bg) 100%)',
                  },
                },
              }}
            >
              <ToggleButton value="reveal" title={t('scenes.fogReveal')}>
                <VisibilityIcon style={{ fontSize: 15 }} />
                {t('scenes.fogReveal')}
              </ToggleButton>
              <ToggleButton value="cover" title={t('scenes.fogCover')}>
                <VisibilityOffIcon style={{ fontSize: 15 }} />
                {t('scenes.fogCover')}
              </ToggleButton>
            </ToggleButtonGroup>
          )}

          {/* Color swatches + picker — tylko w trybie rysowania */}
          {!isFogMode && (
            <div className="drawing-toolbar__colors">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  className={`drawing-toolbar__color ${drawingColor === c ? 'drawing-toolbar__color--active' : ''}`}
                  style={{ background: c }}
                  onMouseDown={keepFocus}
                  onClick={() => onDrawingColorChange(c)}
                  title={c}
                />
              ))}
              <input
                type="color"
                value={drawingColor}
                onChange={e => onDrawingColorChange(e.target.value)}
                className="drawing-toolbar__color-picker"
                title={t('scenes.drawingColorCustom')}
              />
            </div>
          )}

          {/* Brush size — only for tools that draw strokes. Text has its own size slider in the text
              section (one px slider at a time), and the select tool draws nothing. Fog has no
              select tool, so its brush always shows. */}
          {(isFogMode || (!showTextControls && activeTool !== 'select')) && (
            <div className="drawing-toolbar__slider-row">
              <span className="drawing-toolbar__label">{brushSize}px</span>
              <input
                type="range"
                min="1"
                max="80"
                value={brushSize}
                onChange={e => onBrushSizeChange(Number(e.target.value))}
                className="drawing-toolbar__slider"
                aria-label={t('scenes.brushSize')}
              />
            </div>
          )}

          {/* Fog preview opacity — a GM preference, not a scene setting.
              Changes only what the GM sees; players always get full fog. */}
          {isFogMode && (
            <div className="drawing-toolbar__slider-row">
              <span className="drawing-toolbar__label">{Math.round(fogGmOpacity * 100)}%</span>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={fogGmOpacity}
                onChange={e => onFogGmOpacityChange(Number(e.target.value))}
                className="drawing-toolbar__slider"
                title={t('scenes.fogGmOpacity')}
              />
            </div>
          )}

          {/* Text style — for the text tool and for a selected label. The parent decides what the
              controls act on: the open label, the selected label, or the next new label. */}
          {!isFogMode && showTextControls && textStyle && (
            <div className="drawing-toolbar__text">
              <select
                className="drawing-toolbar__select"
                value={textStyle.fontFamily}
                onChange={e => onTextStyleChange({ fontFamily: e.target.value })}
                aria-label={t('scenes.textFont')}
              >
                {TEXT_FONTS.map(f => (
                  <option key={f.id} value={f.id} style={{ fontFamily: f.css }}>{t(f.labelKey)}</option>
                ))}
              </select>

              <div className="drawing-toolbar__slider-row">
                <span className="drawing-toolbar__label">{textStyle.fontSize}px</span>
                <input
                  type="range"
                  min={TEXT_FONT_SIZE_MIN}
                  max={TEXT_FONT_SIZE_MAX}
                  value={textStyle.fontSize}
                  onChange={e => onTextStyleChange({ fontSize: Number(e.target.value) })}
                  className="drawing-toolbar__slider"
                  aria-label={t('scenes.textSize')}
                />
              </div>

              <div className="drawing-toolbar__text-toggles">
                <button
                  className={`drawing-toolbar__tool drawing-toolbar__tool--small ${textStyle.bold ? 'drawing-toolbar__tool--active' : ''}`}
                  onMouseDown={keepFocus}
                  onClick={() => onTextStyleChange({ bold: !textStyle.bold })}
                  aria-pressed={!!textStyle.bold}
                >
                  <FormatBoldIcon style={{ fontSize: 18 }} />
                  <span className="drawing-toolbar__tooltip">{t('scenes.textBold')}</span>
                </button>
                <button
                  className={`drawing-toolbar__tool drawing-toolbar__tool--small ${textStyle.italic ? 'drawing-toolbar__tool--active' : ''}`}
                  onMouseDown={keepFocus}
                  onClick={() => onTextStyleChange({ italic: !textStyle.italic })}
                  aria-pressed={!!textStyle.italic}
                >
                  <FormatItalicIcon style={{ fontSize: 18 }} />
                  <span className="drawing-toolbar__tooltip">{t('scenes.textItalic')}</span>
                </button>
                <span className="drawing-toolbar__text-divider" />
                {TEXT_BACKDROP_OPTIONS.map(({ value, Icon, labelKey }) => (
                  <button
                    key={value}
                    className={`drawing-toolbar__tool drawing-toolbar__tool--small ${textStyle.textBackdrop === value ? 'drawing-toolbar__tool--active' : ''}`}
                    onMouseDown={keepFocus}
                    onClick={() => onTextStyleChange({ textBackdrop: value })}
                    aria-pressed={textStyle.textBackdrop === value}
                  >
                    <Icon style={{ fontSize: 16 }} />
                    <span className="drawing-toolbar__tooltip">{t(labelKey)}</span>
                  </button>
                ))}
              </div>

              {/* Backdrop colour — only once there is a backdrop to colour. textBackdropColor is
                  the colour actually drawn (the automatic one when backdropColor is ''). */}
              {textStyle.textBackdrop !== 'none' && (
                <div className="drawing-toolbar__text-toggles">
                  <span className="drawing-toolbar__label drawing-toolbar__label--left">{t('scenes.textBackdropColor')}</span>
                  <input
                    type="color"
                    value={textBackdropColor}
                    onChange={e => onTextStyleChange({ backdropColor: e.target.value })}
                    className="drawing-toolbar__color-picker"
                    aria-label={t('scenes.textBackdropColor')}
                  />
                  <button
                    className={`drawing-toolbar__tool drawing-toolbar__tool--small ${!textStyle.backdropColor ? 'drawing-toolbar__tool--active' : ''}`}
                    onMouseDown={keepFocus}
                    onClick={() => onTextStyleChange({ backdropColor: '' })}
                    aria-pressed={!textStyle.backdropColor}
                  >
                    <AutoFixHighIcon style={{ fontSize: 16 }} />
                    <span className="drawing-toolbar__tooltip">{t('scenes.textBackdropColorAuto')}</span>
                  </button>
                </div>
              )}

              <div className="drawing-toolbar__slider-row">
                <span className="drawing-toolbar__label">{Math.round(textStyle.rotation)}°</span>
                <input
                  type="range"
                  min="-180"
                  max="180"
                  value={Math.round(textStyle.rotation)}
                  onChange={e => onTextStyleChange({ rotation: Number(e.target.value) })}
                  className="drawing-toolbar__slider"
                  aria-label={t('scenes.textRotate')}
                />
                <button
                  className="drawing-toolbar__action drawing-toolbar__action--small"
                  onMouseDown={keepFocus}
                  onClick={() => onTextStyleChange({ rotation: 0 })}
                  disabled={!textStyle.rotation}
                >
                  <RestartAltIcon style={{ fontSize: 16 }} />
                  <span className="drawing-toolbar__tooltip">{t('scenes.textRotateReset')}</span>
                </button>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="drawing-toolbar__actions">
            <button
              className="drawing-toolbar__action"
              onClick={handleUndo}
              disabled={!undoEnabled}
            >
              <UndoIcon style={{ fontSize: 18 }} />
              <span className="drawing-toolbar__tooltip">{t('scenes.drawingUndo')}</span>
            </button>
            {isGM && isFogMode && (
              <>
                <button
                  className="drawing-toolbar__action"
                  onClick={onRevealAllFog}
                >
                  <WbSunnyIcon style={{ fontSize: 18 }} />
                  <span className="drawing-toolbar__tooltip">{t('scenes.fogRevealAll')}</span>
                </button>
                <button
                  className="drawing-toolbar__action"
                  onClick={handleClear}
                >
                  <FoggyIcon style={{ fontSize: 18 }} />
                  <span className="drawing-toolbar__tooltip">{t('scenes.fogCoverAll')}</span>
                </button>
              </>
            )}
            {isGM && !isFogMode && (
              <button
                className="drawing-toolbar__action drawing-toolbar__action--danger"
                onClick={handleClear}
                disabled={!undoEnabled}
              >
                <DeleteSweepIcon style={{ fontSize: 18 }} />
                <span className="drawing-toolbar__tooltip">{t('scenes.drawingClear')}</span>
              </button>
            )}
            {!isFogMode && (
              <button
                className="drawing-toolbar__action drawing-toolbar__action--danger"
                onClick={() => onDeleteSelected?.()}
                disabled={!selectedPathId}
              >
                <DeleteIcon style={{ fontSize: 18 }} />
                <span className="drawing-toolbar__tooltip">{t('scenes.drawingDelete')}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DrawingToolbar;
