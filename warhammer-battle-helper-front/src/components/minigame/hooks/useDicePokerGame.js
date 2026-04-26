import { useState, useCallback, useEffect, useRef } from 'react';
import { rollDice, setHeld as setHeldApi, confirmHand, nextRound, endMinigame } from '../../../api/minigame';

const EMPTY_DICE = [0, 0, 0, 0, 0];
const EMPTY_HELD = [false, false, false, false, false];

export function useDicePokerGame({ state, gameId, userId, isGM, onClose }) {
  const [ownDice, setOwnDice] = useState(EMPTY_DICE);
  const [ownHeld, setOwnHeld] = useState(EMPTY_HELD);
  const [ownRollsLeft, setOwnRollsLeft] = useState(2);
  const [isRolling, setIsRolling] = useState(false);
  const [revealPhase, setRevealPhase] = useState('idle');
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  const prevPlayerIdxRef = useRef(-1);

  const {
    players = [],
    currentPlayerIdx = 0,
    phase = 'rolling',
  } = state || {};

  const currentPlayer = players[currentPlayerIdx];
  const isMyTurn = currentPlayer?.userId === userId || (currentPlayer?.isNpc && isGM);
  const hasRolled = ownRollsLeft < 2;
  const myPlayerIdx = players.findIndex(p => p.userId === userId);

  useEffect(() => {
    if (prevPlayerIdxRef.current !== currentPlayerIdx) {
      prevPlayerIdxRef.current = currentPlayerIdx;
      const cp = players[currentPlayerIdx];
      const isMine = cp?.userId === userId || (cp?.isNpc && isGM);
      if (isMine) {
        setOwnDice(EMPTY_DICE);
        setOwnHeld(EMPTY_HELD);
        setOwnRollsLeft(2);
      }
    }
  }, [currentPlayerIdx, players, userId, isGM]);

  useEffect(() => {
    if (phase === 'reveal' && revealPhase === 'idle') {
      setRevealPhase('flipping');
      setTimeout(() => setRevealPhase('done'), 500);
    }
    if (phase === 'rolling') {
      setRevealPhase('idle');
    }
  }, [phase, revealPhase]);

  const handleRoll = useCallback(async () => {
    if (!isMyTurn || ownRollsLeft <= 0 || isRolling) return;
    setIsRolling(true);
    try {
      const result = await rollDice(gameId);
      if (result?.dice) {
        setOwnDice(result.dice);
        setOwnHeld(result.held || EMPTY_HELD);
        setOwnRollsLeft(result.rollsLeft ?? 0);
      }
    } catch (e) {
      console.error('Roll failed', e);
    }
    setTimeout(() => setIsRolling(false), 700);
  }, [isMyTurn, ownRollsLeft, isRolling, gameId]);

  const handleToggleHold = useCallback(async (idx) => {
    if (!isMyTurn || !hasRolled || ownRollsLeft <= 0) return;
    const newHeld = [...ownHeld];
    newHeld[idx] = !newHeld[idx];
    setOwnHeld(newHeld);
    try {
      await setHeldApi(gameId, newHeld);
    } catch {
      setOwnHeld(ownHeld);
    }
  }, [isMyTurn, hasRolled, ownRollsLeft, ownHeld, gameId]);

  const handleConfirm = useCallback(async () => {
    if (!isMyTurn || !hasRolled) return;
    try {
      await confirmHand(gameId);
    } catch (e) {
      console.error('Confirm failed', e);
    }
  }, [isMyTurn, hasRolled, gameId]);

  const handleNextRound = useCallback(async () => {
    if (!isGM) return;
    try {
      await nextRound(gameId);
    } catch (e) {
      console.error('Next round failed', e);
    }
  }, [isGM, gameId]);

  const handleEndGame = useCallback(async () => {
    try {
      await endMinigame(gameId);
    } catch (e) {
      console.error('End game failed', e);
    }
    setShowEndConfirm(false);
    onClose();
  }, [gameId, onClose]);

  return {
    ownDice,
    ownHeld,
    ownRollsLeft,
    isRolling,
    revealPhase,
    showEndConfirm,
    setShowEndConfirm,
    hasRolled,
    myPlayerIdx,
    handleRoll,
    handleToggleHold,
    handleConfirm,
    handleNextRound,
    handleEndGame,
  };
}
