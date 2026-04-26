import { useMemo } from 'react';

export function useGameTurn(players, currentPlayerIdx, userId, isGM) {
  return useMemo(() => {
    const currentPlayer = players?.[currentPlayerIdx];
    const isMyTurn = currentPlayer?.userId === userId || (currentPlayer?.isNpc && isGM);
    return { currentPlayer, isMyTurn };
  }, [players, currentPlayerIdx, userId, isGM]);
}
