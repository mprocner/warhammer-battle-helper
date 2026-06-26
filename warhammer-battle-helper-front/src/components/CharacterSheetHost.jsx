import React, { useEffect } from 'react';
import { getSystem } from '../systems/registry';

/**
 * Renderuje wszystkie otwarte karty postaci (multi-open). Żyje w DndContext,
 * bo tam są żywe dane postaci i handleCharacterUpdate. Każda karta dostaje
 * AKTUALNĄ postać rozwiązaną po id (resolveCharacter), więc aktualizacje WS
 * docierają do otwartych kart. Karty rejestrują się na listwie przez
 * useManagedWindow w DraggablePopup.
 */
function CharacterSheetHost({
  openCharacterIds,
  resolveCharacter,
  onClose,
  onCharacterUpdate,
  addLogMessage,
  gameId,
  token,
  isGM,
  gameSystem,
  rollVisibility,
  game,
}) {
  const system = getSystem(gameSystem);
  const Sheet = system?.CharacterSheet;

  // Posprzątaj wpisy, których postać już nie istnieje (np. została usunięta)
  useEffect(() => {
    openCharacterIds.forEach(id => {
      if (!resolveCharacter(id)) onClose(id);
    });
  }, [openCharacterIds, resolveCharacter, onClose]);

  if (!Sheet) return null;

  return (
    <>
      {openCharacterIds.map(id => {
        const character = resolveCharacter(id);
        if (!character) return null;
        return (
          <Sheet
            key={id}
            character={character}
            onClose={() => onClose(id)}
            onCharacterUpdate={onCharacterUpdate}
            addLogMessage={addLogMessage}
            gameId={gameId}
            token={token}
            isGM={isGM}
            rollVisibility={rollVisibility}
            game={game}
          />
        );
      })}
    </>
  );
}

export default CharacterSheetHost;
