import React from 'react';
import { useTranslation } from 'react-i18next';
import GroupsIcon from '@mui/icons-material/Groups';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import WallpaperIcon from '@mui/icons-material/Wallpaper';
import './LayerSelector.css';

// Armed image layer picker — split out of DrawingToolbar so choosing a layer
// (bg/tokens/gm) is independent from picking a tool. GM-only; always visible.
// Order top→bottom matches the tool cluster mockup: tokens / gm / background.
// labelKey = krótka etykieta na pasku; titleKey = pełny tekst w tooltipie
// (domyślnie ten sam co label). gm ma krótkie 'GM' + tooltip 'GM Layer'.
const LAYERS = [
  { value: 'tokens',     Icon: GroupsIcon,             labelKey: 'scenes.layerTokens' },
  { value: 'gm',         Icon: AdminPanelSettingsIcon, labelKey: 'scenes.layerGmShort', titleKey: 'scenes.layerGm' },
  { value: 'background', Icon: WallpaperIcon,          labelKey: 'scenes.layerBackground' },
];

const LayerSelector = ({ imageEditLayer, onImageEditLayerChange, isGM }) => {
  const { t } = useTranslation();
  if (!isGM) return null;

  return (
    <div className="layer-selector">
      {LAYERS.map(({ value, Icon, labelKey, titleKey }) => (
        <button
          key={value}
          className={`layer-selector__btn ${imageEditLayer === value ? 'layer-selector__btn--active' : ''}`}
          onClick={() => onImageEditLayerChange(value)}
        >
          <Icon style={{ fontSize: 20 }} />
          <span className="layer-selector__label">{t(labelKey)}</span>
          <span className="layer-selector__tooltip">{t(titleKey || labelKey)}</span>
        </button>
      ))}
    </div>
  );
};

export default LayerSelector;
