import React, { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import LibraryMusicOutlinedIcon from '@mui/icons-material/LibraryMusicOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import LogWindow from '../LogWindow';
import ScenesTab from '../tabs/ScenesTab';
import HandoutsTab from '../tabs/HandoutsTab';
import FilesTab from '../tabs/FilesTab';
import MusicTab from '../tabs/MusicTab';
import GeneralTab from '../tabs/GeneralTab';
import './RightPanel.css';

/**
 * Right panel with vertical tabs containing Chat, Scenes, Handouts, and General settings
 */
const RightPanel = ({
  isHidden,
  logs,
  addLogMessage,
  gameId,
  token,
  onLogout,
  onLeaveGame,
  onGoToGameList,
  gameState,
  isConnected,
  currentSceneId,
  onSceneChange,
  editingLayer,
  onEditingLayerChange,
  musicState,
  audioRef,
  playerVolume,
  onPlayerVolumeChange
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('chat');

  // Get current user ID from token
  const getUserId = useCallback(() => {
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.user_id;
    } catch {
      return null;
    }
  }, [token]);

  const userId = getUserId();
  const isGM = gameState?.gameMasterId === userId;

  // Build tabs array - Files and Scenes tabs only visible to GM
  const tabs = useMemo(() => {
    const baseTabs = [
      { id: 'chat', icon: <ChatBubbleOutlineIcon />, label: t('rightPanel.tabs.chat') },
    ];

    if (isGM) {
      baseTabs.push({ id: 'scenes', icon: <MapOutlinedIcon />, label: t('rightPanel.tabs.scenes') });
    }

    baseTabs.push({ id: 'handouts', icon: <ArticleOutlinedIcon />, label: t('rightPanel.tabs.handouts') });

    if (isGM) {
      baseTabs.push({ id: 'files', icon: <FolderOutlinedIcon />, label: t('rightPanel.tabs.files') });
      baseTabs.push({ id: 'music', icon: <LibraryMusicOutlinedIcon />, label: t('rightPanel.tabs.music') });
    }

    baseTabs.push({ id: 'general', icon: <SettingsOutlinedIcon />, label: t('rightPanel.tabs.general') });

    return baseTabs;
  }, [isGM, t]);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'chat':
        return (
          <LogWindow
            logs={logs}
            addLogMessage={addLogMessage}
            gameId={gameId}
            token={token}
          />
        );
      case 'scenes':
        return (
          <ScenesTab
            gameId={gameId}
            token={token}
            gameState={gameState}
            isConnected={isConnected}
            currentSceneId={currentSceneId}
            onSceneChange={onSceneChange}
            editingLayer={editingLayer}
            onEditingLayerChange={onEditingLayerChange}
          />
        );
      case 'handouts':
        // HandoutsTab is always mounted below to preserve folder expand state
        return null;
      case 'files':
        return (
          <FilesTab
            token={token}
            gameId={gameId}
            currentSceneId={currentSceneId}
          />
        );
      case 'music':
        // MusicTab is always rendered below to keep it mounted; return null here
        return null;
      case 'general':
        return (
          <GeneralTab
            onLogout={onLogout}
            onLeaveGame={onLeaveGame}
            onGoToGameList={onGoToGameList}
            gameState={gameState}
            isConnected={isConnected}
            playerVolume={playerVolume}
            onPlayerVolumeChange={onPlayerVolumeChange}
            musicState={musicState}
            isGM={isGM}
            token={token}
            gameId={gameId}
          />
        );
      default:
        return null;
    }
  };

  return (
    <aside className={`right-panel ${isHidden ? 'right-panel--hidden' : ''}`}>
      {/* Panel Header */}
      <header className="panel-header">
        <h2 className="panel-header__title">{t('rightPanel.title')}</h2>
      </header>

      {/* Tabs Wrapper */}
      <div className="right-panel__tabs-wrapper">
        {/* Vertical Tab Navigation */}
        <nav className="right-panel__tabs-nav">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`right-panel__tab-btn ${activeTab === tab.id ? 'right-panel__tab-btn--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="right-panel__tab-icon">{tab.icon}</span>
              <span className="right-panel__tab-label">{tab.label}</span>
            </button>
          ))}
        </nav>

        {/* Tab Content Area */}
        <div className="right-panel__tab-content">
          {renderTabContent()}
          {/* HandoutsTab is always mounted to preserve folder expand/collapse state */}
          <div style={{ display: activeTab === 'handouts' ? 'contents' : 'none' }}>
            <HandoutsTab
              gameId={gameId}
              token={token}
              gameState={gameState}
              isConnected={isConnected}
            />
          </div>
          {/* MusicTab is always mounted so audio event listeners persist across tab switches */}
          {isGM && (
            <div style={{ display: activeTab === 'music' ? 'contents' : 'none' }}>
              <MusicTab
                gameId={gameId}
                token={token}
                musicState={musicState}
                audioRef={audioRef}
              />
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};

export default RightPanel;
