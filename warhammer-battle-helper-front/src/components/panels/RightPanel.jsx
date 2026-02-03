import React, { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import LogWindow from '../LogWindow';
import ScenesTab from '../tabs/ScenesTab';
import HandoutsTab from '../tabs/HandoutsTab';
import FilesTab from '../tabs/FilesTab';
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
  gameState,
  isConnected
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

  // Build tabs array - Files tab only visible to GM
  const tabs = useMemo(() => {
    const baseTabs = [
      { id: 'chat', icon: '💬', label: t('rightPanel.tabs.chat') },
      { id: 'scenes', icon: '🗺️', label: t('rightPanel.tabs.scenes') },
      { id: 'handouts', icon: '📜', label: t('rightPanel.tabs.handouts') },
    ];

    if (isGM) {
      baseTabs.push({ id: 'files', icon: '📁', label: t('rightPanel.tabs.files') });
    }

    baseTabs.push({ id: 'general', icon: '⚙️', label: t('rightPanel.tabs.general') });

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
        return <ScenesTab />;
      case 'handouts':
        return (
          <HandoutsTab
            gameId={gameId}
            token={token}
            gameState={gameState}
            isConnected={isConnected}
          />
        );
      case 'files':
        return (
          <FilesTab
            token={token}
          />
        );
      case 'general':
        return (
          <GeneralTab
            onLogout={onLogout}
            onLeaveGame={onLeaveGame}
            gameState={gameState}
            isConnected={isConnected}
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
        </div>
      </div>
    </aside>
  );
};

export default RightPanel;
