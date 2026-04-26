---
name: Dice Poker Board Design
description: Design decisions for Dice Poker mini-game — hidden dice mechanic, reveal phase, turn flow, round score tally, NPC name inputs
type: project
---

## Core structural difference from Yahtzee

Yahtzee is simultaneous (everyone watches one player roll, then score). Dice Poker is sequential-then-reveal: each player rolls privately, then all hands are shown at once. This requires a **reveal phase** state that Yahtzee does not have.

State machine: `rolling` (whose turn) → `confirming` (last player confirmed) → `reveal` (all hands shown, winner announced) → `next_round` or `ended`.

## Board modal layout (900px DraggablePopup)

Left column (380px): own dice area + action buttons + "other players" status list
Right column (520px, flex-fill): round score tally

**Why left-heavy:** The dice interaction is primary. The score tally in Poker is simpler than Yahtzee (just wins per player) so it needs far less space.

## Hidden dice mechanic

- Own dice: always visible (face up SVG dots), same `YahtzeeDie` component
- Others' dice: render as `[?]` placeholder — a die-shaped tile with `?` glyph, class `.poker-die--hidden`
- State text per other player: "Rolling..." | "Re-rolling..." | "Confirmed ✓" (CheckCircleIcon)
- GM sees NPC dice face-up (NPC is always isGM's controlled seat)

## Reveal phase animation

**Simultaneous flip, no stagger.** All `[?]` tiles flip to real values at the same moment.
Reasoning: staggered reveals introduce suspense theater that slows play; simultaneous is truer to table feel.

Animation: CSS `rotateY(0deg → 90deg → 0deg)` in 400ms per die, all triggered via a class `.poker-die--revealing` added simultaneously. Value swap happens at the 90deg midpoint (invisible moment).

Winner highlight: after reveal settles (400ms), add `.poker-round__winner` to winning player row — gold border + subtle background pulse (1.5s ease-out, single iteration, not looping). If tie: all tied players get the class.

Hand name label appears below each player's dice row during reveal, e.g. "Full House", "Two Pair". This uses a `.poker-hand-label` element that fades in at 300ms (after flip starts).

## NPC name inputs pattern

When `gmSeats > 0`, replace the static hint text with a flex-column of text inputs.
Each input:  `minigame-setup__npc-name-input`, placeholder = "NPC 1" / "NPC 2" etc.
Value used in `players.push({ username: npcNames[i] || t('minigames.npcSeat', {n: i+1}) })`

**Shared pattern**: same component/pattern for both Yahtzee and Dice Poker setups. Controlled by local state `npcNames = ['', '', '', '']` (4 slots max), sliced to `gmSeats` length on render.

## Round score tally

Right panel in board modal — replaces Yahtzee's scorecard.
Simple table: player name | rounds won | (current round badge if applicable)
Row height ~36px, no horizontal scroll needed (fewer columns than Yahtzee scorecard).

## i18n key namespace additions needed

- `minigames.dicePoker.title`
- `minigames.dicePoker.meta`
- `minigames.dicePoker.confirmHand`
- `minigames.dicePoker.reRoll`
- `minigames.dicePoker.rollsLeft` (max 2)
- `minigames.dicePoker.waitingReveal`
- `minigames.dicePoker.revealPhase`
- `minigames.dicePoker.roundWinner`
- `minigames.dicePoker.roundTie`
- `minigames.dicePoker.endGame`
- `minigames.dicePoker.hands.*` (highCard, onePair, twoPair, threeOfAKind, straight, fullHouse, fourOfAKind, fiveOfAKind)
- `minigames.setup.npcNamePlaceholder` (shared)

## CSS classes needed (new)

- `.poker-board__*` — board modal BEM root (mirrors yahtzee-board)
- `.poker-die--hidden` — `[?]` placeholder tile
- `.poker-die--revealing` — flip animation trigger class
- `.poker-hand-label` — hand name label shown after reveal
- `.poker-players-status__*` — other-players list during rolling phase
- `.poker-round-tally__*` — right-column score table
- `.poker-round__winner` — gold highlight on winning row
- `.minigame-setup__npc-name-input` — text input for NPC names (shared)
- `.minigame-setup__npc-names` — wrapper flex-column for NPC name inputs

**Why:** Keeping `.poker-*` as root block avoids bleeding into `.yahtzee-*` styles. Both share `.minigame-setup__*` since setup form is shared context.