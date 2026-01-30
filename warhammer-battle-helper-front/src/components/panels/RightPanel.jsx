import React, { useState } from 'react';
import LogWindow from '../LogWindow';
import ScenesTab from '../tabs/ScenesTab';
import HandoutsTab from '../tabs/HandoutsTab';
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
  const [activeTab, setActiveTab] = useState('chat');

  const tabs = [
    { id: 'chat', icon: '💬', label: 'Chat' },
    { id: 'scenes', icon: '🗺️', label: 'Scenes' },
    { id: 'handouts', icon: '📜', label: 'Handouts' },
    { id: 'general', icon: '⚙️', label: 'General' },
  ];

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
        return <HandoutsTab />;
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
        <h2 className="panel-header__title">Settings</h2>
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
