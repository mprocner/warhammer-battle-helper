import React from 'react';
import CasinoIcon from '@mui/icons-material/Casino';
import StyleIcon from '@mui/icons-material/Style';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';

function MinigameList({ minigameState, onReopenBoard, onSelectGame, t }) {
  const yahtzeeActive = minigameState && !minigameState.ended && minigameState.gameType === 'yahtzee';
  const dicePokerActive = minigameState && !minigameState.ended && minigameState.gameType === 'dicepoker';

  return (
    <div className="minigame-list">
      <h3 className="minigame-list__title">{t('minigames.title')}</h3>

      <button
        className={`minigame-list__item ${yahtzeeActive ? 'minigame-list__item--active' : ''} ${dicePokerActive ? 'minigame-list__item--disabled' : ''}`}
        onClick={() => yahtzeeActive ? onReopenBoard() : !dicePokerActive && onSelectGame('yahtzee')}
        disabled={dicePokerActive}
      >
        <CasinoIcon className="minigame-list__item-icon" />
        <div className="minigame-list__item-info">
          <span className="minigame-list__item-title">{t('minigames.yahtzee.title')}</span>
          <span className="minigame-list__item-meta">
            {yahtzeeActive
              ? <><PlayArrowIcon fontSize="inherit" /> {t('minigames.inProgress')}</>
              : t('minigames.yahtzee.meta')
            }
          </span>
        </div>
        <ChevronRightIcon className="minigame-list__item-chevron" />
      </button>

      <button
        className={`minigame-list__item ${dicePokerActive ? 'minigame-list__item--active' : ''} ${yahtzeeActive ? 'minigame-list__item--disabled' : ''}`}
        onClick={() => dicePokerActive ? onReopenBoard() : !yahtzeeActive && onSelectGame('dicepoker')}
        disabled={yahtzeeActive}
      >
        <StyleIcon className="minigame-list__item-icon" />
        <div className="minigame-list__item-info">
          <span className="minigame-list__item-title">{t('minigames.dicePoker.title')}</span>
          <span className="minigame-list__item-meta">
            {dicePokerActive
              ? <><PlayArrowIcon fontSize="inherit" /> {t('minigames.inProgress')}</>
              : t('minigames.dicePoker.meta')
            }
          </span>
        </div>
        <ChevronRightIcon className="minigame-list__item-chevron" />
      </button>
    </div>
  );
}

export default MinigameList;
