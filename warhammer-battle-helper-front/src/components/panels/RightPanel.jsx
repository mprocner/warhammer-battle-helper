import React, { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import LibraryMusicOutlinedIcon from '@mui/icons-material/LibraryMusicOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import StickyNote2OutlinedIcon from '@mui/icons-material/StickyNote2Outlined';
import CasinoOutlinedIcon from '@mui/icons-material/CasinoOutlined';
import LogWindow from '../LogWindow';
import DiceRollControls from '../log/DiceRollControls';
import { getApiUrl, getApiHeaders } from '../../api/axios';
import ScenesTab from '../tabs/ScenesTab';
import HandoutsTab from '../tabs/HandoutsTab';
import FilesTab from '../tabs/FilesTab';
import MusicTab from '../tabs/MusicTab';
import GeneralTab from '../tabs/GeneralTab';
import PlayersTab from '../tabs/PlayersTab';
import NotesTab from '../tabs/NotesTab';
import MinigameTab from '../tabs/MinigameTab';
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
  onPlayerVolumeChange,
  onlineUserIds = [],
  onParticipantUpdated,
  rollVisibility = 'all',
  onRollVisibilityChange,
  controlScheme,
  onControlSchemeChange,
  minigameState = null,
  onReopenMinigameBoard,
  activeTab: externalActiveTab,
  onTabChange,
}) => {
  const { t } = useTranslation();
  const [internalActiveTab, setInternalActiveTab] = useState('chat');
  const activeTab = externalActiveTab ?? internalActiveTab;
  const setActiveTab = onTabChange ?? setInternalActiveTab;

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

  const sendMessage = useCallback(async (text) => {
    try {
      if (gameId && token) {
        const response = await fetch(`${getApiUrl()}/games/${gameId}/message`, {
          method: 'POST',
          headers: getApiHeaders({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }),
          body: JSON.stringify({ message: text })
        });
        if (!response.ok) throw new Error('Failed to send message');
      } else {
        addLogMessage(text, 'info');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      addLogMessage('Failed to send message', 'error');
    }
  }, [gameId, token, addLogMessage]);

  const rollDice = useCallback(async (sides) => {
    try {
      if (gameId && token) {
        const response = await fetch(`${getApiUrl()}/games/${gameId}/roll`, {
          method: 'POST',
          headers: getApiHeaders({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }),
          body: JSON.stringify({ sides, visibility: rollVisibility })
        });
        if (!response.ok) throw new Error('Failed to roll dice');
      } else {
        const result = Math.floor(Math.random() * sides) + 1;
        addLogMessage(`Rolled d${sides}: ${result}`, 'success');
      }
    } catch (error) {
      console.error('Error rolling dice:', error);
      addLogMessage('Failed to roll dice', 'error');
    }
  }, [gameId, token, addLogMessage, rollVisibility]);

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

    baseTabs.push({ id: 'notes', icon: <StickyNote2OutlinedIcon />, label: t('rightPanel.tabs.notes') });

    if (isGM) {
      baseTabs.push({ id: 'players', icon: <PeopleOutlinedIcon />, label: t('rightPanel.tabs.players') });
      baseTabs.push({ id: 'minigames', icon: <CasinoOutlinedIcon />, label: t('rightPanel.tabs.minigames') });
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
            gameSystem={gameState?.gameSystem}
            currentUserId={userId}
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
      case 'notes':
        // NotesTab is always mounted below to preserve editor popup across tab switches
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
      case 'players':
        return (
          <PlayersTab
            gameId={gameId}
            token={token}
            gameState={gameState}
            onlineUserIds={onlineUserIds}
            onParticipantUpdated={onParticipantUpdated}
          />
        );
      case 'minigames':
        return (
          <MinigameTab
            gameState={gameState}
            onlineUserIds={onlineUserIds}
            userId={userId}
            minigameState={minigameState}
            onReopenBoard={onReopenMinigameBoard}
          />
        );
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
            controlScheme={controlScheme}
            onControlSchemeChange={onControlSchemeChange}
            gameId={gameId}
            token={token}
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

        {/* Right column: tab content + persistent dice controls */}
        <div className="right-panel__right-col">
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
            {/* NotesTab is always mounted to preserve editor popup across tab switches */}
            <div style={{ display: activeTab === 'notes' ? 'contents' : 'none' }}>
              <NotesTab
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

          <DiceRollControls onRoll={rollDice} onSendMessage={sendMessage} rollVisibility={rollVisibility} onVisibilityChange={onRollVisibilityChange} />
        </div>
      </div>
    </aside>
  );
};

export default RightPanel;
