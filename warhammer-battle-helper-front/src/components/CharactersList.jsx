import React from 'react';
import { useTranslation } from 'react-i18next';
import Character from './Character';

function CharactersList( props ) {
  const { t } = useTranslation();

  return (
    <aside className="character-list">
      <h2>{t('game.characterCards')}</h2>
        {(props.characters || []).map(char => (
        <Character
            key={char.id}
            addLogMessage={props.addLogMessage}
            id={char.id}
            character={char}
            onCharacterUpdate={props.onCharacterUpdate}
        />

      ))}
    </aside>
  );
}

export default CharactersList