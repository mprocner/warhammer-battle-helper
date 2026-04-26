export const HAND_RANKS = {
  HIGH_CARD: 0,
  ONE_PAIR: 1,
  TWO_PAIR: 2,
  THREE_OF_A_KIND: 3,
  STRAIGHT: 4,
  FULL_HOUSE: 5,
  FOUR_OF_A_KIND: 6,
  FIVE_OF_A_KIND: 7,
};

const LABEL_KEYS = {
  0: 'minigames.dicePoker.hands.highCard',
  1: 'minigames.dicePoker.hands.onePair',
  2: 'minigames.dicePoker.hands.twoPair',
  3: 'minigames.dicePoker.hands.threeOfAKind',
  4: 'minigames.dicePoker.hands.straight',
  5: 'minigames.dicePoker.hands.fullHouse',
  6: 'minigames.dicePoker.hands.fourOfAKind',
  7: 'minigames.dicePoker.hands.fiveOfAKind',
};

export function classifyHand(dice) {
  if (!dice || dice.length !== 5 || dice.some(d => d === 0)) {
    return { rank: -1, labelKey: '' };
  }

  const counts = new Array(7).fill(0);
  for (const d of dice) {
    if (d >= 1 && d <= 6) counts[d]++;
  }

  // Straight: 1-2-3-4-5 or 2-3-4-5-6
  if (counts[1] && counts[2] && counts[3] && counts[4] && counts[5]) {
    return { rank: HAND_RANKS.STRAIGHT, labelKey: LABEL_KEYS[HAND_RANKS.STRAIGHT] };
  }
  if (counts[2] && counts[3] && counts[4] && counts[5] && counts[6]) {
    return { rank: HAND_RANKS.STRAIGHT, labelKey: LABEL_KEYS[HAND_RANKS.STRAIGHT] };
  }

  const maxCount = Math.max(...counts);
  const pairCount = counts.filter(c => c === 2).length;

  if (maxCount === 5) return { rank: HAND_RANKS.FIVE_OF_A_KIND, labelKey: LABEL_KEYS[7] };
  if (maxCount === 4) return { rank: HAND_RANKS.FOUR_OF_A_KIND, labelKey: LABEL_KEYS[6] };
  if (maxCount === 3 && pairCount === 1) return { rank: HAND_RANKS.FULL_HOUSE, labelKey: LABEL_KEYS[5] };
  if (maxCount === 3) return { rank: HAND_RANKS.THREE_OF_A_KIND, labelKey: LABEL_KEYS[3] };
  if (pairCount === 2) return { rank: HAND_RANKS.TWO_PAIR, labelKey: LABEL_KEYS[2] };
  if (pairCount === 1) return { rank: HAND_RANKS.ONE_PAIR, labelKey: LABEL_KEYS[1] };
  return { rank: HAND_RANKS.HIGH_CARD, labelKey: LABEL_KEYS[0] };
}
