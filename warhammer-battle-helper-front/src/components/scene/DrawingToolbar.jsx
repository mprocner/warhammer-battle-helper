import React from 'react';
import { useTranslation } from 'react-i18next';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import EditIcon from '@mui/icons-material/Edit';
import CloudIcon from '@mui/icons-material/Cloud';
import OpenWithIcon from '@mui/icons-material/OpenWith';
import BrushIcon from '@mui/icons-material/Brush';
import HorizontalRuleIcon from '@mui/icons-material/HorizontalRule';
import CropSquareIcon from '@mui/icons-material/CropSquare';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import PolylineIcon from '@mui/icons-material/Polyline';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import NearMeIcon from '@mui/icons-material/NearMe';
import UndoIcon from '@mui/icons-material/Undo';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import FoggyIcon from '@mui/icons-material/Foggy';
import WbSunnyIcon from '@mui/icons-material/WbSunny';
import './DrawingToolbar.css';

const PRESET_COLORS = ['#000000', '#ff0000', '#00c853', '#2979ff', '#ffea00', '#ffffff'];

// fogCompat: true → narzędzie widoczne w trybie mgły; false → ukryte w fog mode
const TOOLS = [
  { value: 'freehand', Icon: BrushIcon,               labelKey: 'scenes.drawingTool_freehand', fogCompat: true  },
  { value: 'line',     Icon: HorizontalRuleIcon,       labelKey: 'scenes.drawingTool_line',     fogCompat: true  },
  { value: 'rect',     Icon: CropSquareIcon,           labelKey: 'scenes.drawingTool_rect',     fogCompat: true  },
  { value: 'circle',   Icon: RadioButtonUncheckedIcon, labelKey: 'scenes.drawingTool_circle',   fogCompat: true  },
  { value: 'polygon',  Icon: PolylineIcon,             labelKey: 'scenes.drawingTool_polygon',  fogCompat: true  },
  { value: 'arrow',    Icon: ArrowForwardIcon,         labelKey: 'scenes.drawingTool_arrow',    fogCompat: false },
  { value: 'text',     Icon: TextFieldsIcon,           labelKey: 'scenes.drawingTool_text',     fogCompat: false },
  { value: 'select',   Icon: NearMeIcon,               labelKey: 'scenes.drawingTool_select',   fogCompat: false },
];

const DrawingToolbar = ({
  editingLayer,
  onEditingLayerChange,
  fogCoverMode = false,
  onFogCoverModeChange,
  activeTool,
  onActiveToolChange,
  brushSize,
  onBrushSizeChange,
  drawingColor,
  onDrawingColorChange,
  drawingFontSize,
  onDrawingFontSizeChange,
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
}) => {
  const { t } = useTranslation();
  const isActive = editingLayer === 'drawing' || editingLayer === 'fog';
  const isFogMode = editingLayer === 'fog';

  const handleToggle = () => {
    onEditingLayerChange(isActive ? 'grid' : 'drawing');
  };

  const handleUndo = isFogMode ? onUndoFog : onUndoDrawing;
  const handleClear = isFogMode ? onClearFog : onClearDrawing;
  const undoEnabled = isFogMode ? !!canUndoFog : !!canUndo;

  return (
    <div className={`drawing-toolbar ${isActive ? 'drawing-toolbar--active' : ''}`}>
      {/* Toggle / Tabs */}
      {isGM ? (
        <div className="drawing-toolbar__tabs">
          <button
            className={`drawing-toolbar__tab ${editingLayer === 'grid' ? 'drawing-toolbar__tab--active' : ''}`}
            onClick={() => onEditingLayerChange('grid')}
          >
            <OpenWithIcon style={{ fontSize: 22 }} />
            <span className="drawing-toolbar__tooltip">{t('scenes.sceneLayer')}</span>
          </button>
          <button
            className={`drawing-toolbar__tab ${editingLayer === 'fog' ? 'drawing-toolbar__tab--active' : ''}`}
            onClick={() => onEditingLayerChange(editingLayer === 'fog' ? 'grid' : 'fog')}
          >
            <CloudIcon style={{ fontSize: 22 }} />
            <span className="drawing-toolbar__tooltip">{t('scenes.fogLayer')}</span>
          </button>
          <button
            className={`drawing-toolbar__tab ${editingLayer === 'drawing' ? 'drawing-toolbar__tab--active' : ''}`}
            onClick={() => onEditingLayerChange(editingLayer === 'drawing' ? 'grid' : 'drawing')}
          >
            <EditIcon style={{ fontSize: 22 }} />
            <span className="drawing-toolbar__tooltip">{t('scenes.drawingLayer')}</span>
          </button>
        </div>
      ) : (
        <button
          className={`drawing-toolbar__toggle ${isActive ? 'drawing-toolbar__toggle--on' : ''}`}
          onClick={handleToggle}
        >
          <EditIcon style={{ fontSize: 24 }} />
          <span className="drawing-toolbar__tooltip">{t('scenes.drawingLayer')}</span>
        </button>
      )}

      {/* Expanded controls */}
      {isActive && (
        <div className="drawing-toolbar__controls">
          {/* Tool buttons — fog-incompatible tools hidden in fog mode */}
          <div className="drawing-toolbar__tools">
            {TOOLS.filter(({ fogCompat }) => !isFogMode || fogCompat).map(({ value, Icon, labelKey }) => (
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
                  border: '1px solid #d4a574',
                  color: '#6b4423',
                  fontFamily: 'Cinzel, serif',
                  fontSize: '11px',
                  padding: '4px 6px',
                  gap: '4px',
                  background: 'linear-gradient(135deg, #f9f3e8 0%, #f4e8d8 100%)',
                  textTransform: 'none',
                  '&.Mui-selected': {
                    background: 'linear-gradient(135deg, #c9975b 0%, #a67c52 100%)',
                    color: '#fff',
                    borderColor: '#7a5c42',
                    '&:hover': {
                      background: 'linear-gradient(135deg, #d4a574 0%, #c9975b 100%)',
                    },
                  },
                  '&:hover': {
                    background: 'linear-gradient(135deg, #ffffff 0%, #fff9f0 100%)',
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

          {/* Brush size — zawsze widoczny */}
          <div className="drawing-toolbar__slider-row">
            <span className="drawing-toolbar__label">{brushSize}px</span>
            <input
              type="range"
              min="1"
              max="80"
              value={brushSize}
              onChange={e => onBrushSizeChange(Number(e.target.value))}
              className="drawing-toolbar__slider"
            />
          </div>

          {/* Font size — tylko dla narzędzia tekst */}
          {!isFogMode && activeTool === 'text' && (
            <div className="drawing-toolbar__slider-row">
              <span className="drawing-toolbar__label">{drawingFontSize}pt</span>
              <input
                type="range"
                min="10"
                max="72"
                value={drawingFontSize}
                onChange={e => onDrawingFontSizeChange(Number(e.target.value))}
                className="drawing-toolbar__slider"
              />
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
