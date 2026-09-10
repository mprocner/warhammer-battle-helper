import React, { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import LogWindow from '../LogWindow';
import DiceRollControls from '../log/DiceRollControls';
import ChatInput from '../log/ChatInput';
import { getApiUrl, getApiHeaders } from '../../api/axios';
import { tabsForRole } from './tabDefinitions';
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
  onGoToGameList,
  gameState,
  isConnected,
  currentSceneId,
  onSceneChange,
  imageEditLayer = 'background',
  musicState,
  audioRef,
  playerVolume,
  onPlayerVolumeChange,
  onGmVolumeChange,
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
  onStartTutorial,
}) => {
  const { t } = useTranslation();
  const [internalActiveTab, setInternalActiveTab] = useState('chat');
  const activeTab = externalActiveTab ?? internalActiveTab;
  const [onlyMyRolls, setOnlyMyRolls] = useState(false);
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
          body: JSON.stringify({ message: text, visibility: rollVisibility })
        });
        if (!response.ok) throw new Error('Failed to send message');
      } else {
        addLogMessage(text, 'info');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      addLogMessage('Failed to send message', 'error');
    }
  }, [gameId, token, addLogMessage, rollVisibility]);

  const rollDice = useCallback(async (sides, count = 1) => {
    try {
      if (gameId && token) {
        const response = await fetch(`${getApiUrl()}/games/${gameId}/roll`, {
          method: 'POST',
          headers: getApiHeaders({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }),
          body: JSON.stringify({ sides, count, visibility: rollVisibility })
        });
        if (!response.ok) throw new Error('Failed to roll dice');
      } else if (count > 1) {
        const results = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
        const sum = results.reduce((acc, r) => acc + r, 0);
        addLogMessage(`Rolled ${count}d${sides}: ${results.join(', ')} (sum ${sum})`, 'success');
      } else {
        const result = Math.floor(Math.random() * sides) + 1;
        addLogMessage(`Rolled d${sides}: ${result}`, 'success');
      }
    } catch (error) {
      console.error('Error rolling dice:', error);
      addLogMessage('Failed to roll dice', 'error');
    }
  }, [gameId, token, addLogMessage, rollVisibility]);

  // Zakładki i ich kolejność żyją w tabDefinitions — dzieli je z legendą samouczka.
  const tabs = useMemo(
    () => tabsForRole(isGM).map(({ id, Icon }) => ({
      id,
      icon: <Icon />,
      label: t(`rightPanel.tabs.${id}`),
    })),
    [isGM, t]
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'chat':
        return (
          <LogWindow
            logs={logs}
            gameSystem={gameState?.gameSystem}
            currentUserId={userId}
            onlyMine={onlyMyRolls}
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
            imageEditLayer={imageEditLayer}
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
            isGM={isGM}
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
        <button
          type="button"
          className="panel-header__help"
          onClick={onStartTutorial}
          title={t('tutorial.button')}
          aria-label={t('tutorial.button')}
        >
          <HelpOutlineIcon fontSize="small" />
        </button>
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
                  onGmVolumeChange={onGmVolumeChange}
                />
              </div>
            )}
          </div>

          <DiceRollControls onRoll={rollDice} rollVisibility={rollVisibility} onVisibilityChange={onRollVisibilityChange} onlyMyRolls={onlyMyRolls} onToggleOnlyMyRolls={setOnlyMyRolls} diceList={gameState?.customSystemTemplate?.settings?.diceButtons} participants={gameState?.participants || []} currentUserId={userId} />
          <ChatInput onSend={sendMessage} />
        </div>
      </div>
    </aside>
  );
};

export default RightPanel;
