import React from 'react';
import Character from './Character';

function CharactersList( props ) {


  return (
    <aside className="character-list">
      <h2>Karty Postaci</h2>
        {(props.characters || []).map(char => (
        <Character
            key={char.id}
            addLogMessage={props.addLogMessage}
            id={char.id}
            character={char}
        />

      ))}
    </aside>
  );
}

export default CharactersList