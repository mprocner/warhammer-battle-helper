---
name: Mini-games Tab Design
description: Design decisions for GM-only Mini-games tab in the right panel — game selection list, Yahtzee setup form, and full-screen game board modal approach
type: project
---

## Core decision: DraggablePopup over full-screen overlay

Chose `DraggablePopup` (portal-rendered, fixed-position, resizable) rather than a
full-screen overlay that occludes the scene. Rationale: the TTRPG scene is live context
that GM and players need to reference. The game board should float over it, not replace it.
Players can minimize via ModalHeader minimize button (existing pattern in DraggablePopup).

**Why:** Full-screen overlay removes the battle map from view entirely. During a Yahtzee
break mid-session the GM may still need to reference token positions or fog layout.
DraggablePopup is already the app's floating window pattern (character sheets use it).

## Tab registration pattern
- Tab id: `'minigames'`
- Icon: `CasinoIcon` from `@mui/icons-material`
- Registered GM-only via `if (isGM)` guard in `RightPanel.jsx` tabs array
- Tab label i18n key: `rightPanel.tabs.minigames`

## Three view states inside MiniGamesTab
1. **Game list** — grid/list of available mini-game tiles (just Yahtzee initially)
2. **Setup form** — shown after clicking a game tile (no navigation, just conditional render within tab)
3. **Active game indicator** — shows "game in progress" placeholder in the tab content while the board modal is open

## Yahtzee board modal
- Uses `DraggablePopup` with `initialWidth=900` — enough for scorecard + dice side by side
- ModalHeader `extraButtons` slot: "End game" button with `StopCircleIcon`
- Scorecad layout: horizontal scroll when >4 players (scrollable `<table>`, sticky player-name header row)
- Dice area: 5 dice in a flex row, centered, above the Roll button
- Turn indicator: prominent banner at top of modal body, inside the content area (not in header)
  showing current player name + rolls remaining (colored circles: filled = used, empty = available)

## Dice visual states (3 states)
- **normal**: `.yahtzee-die` — parchment background, brown border, die face value
- **held**: `.yahtzee-die--held` — gold background (#c9975b), thicker border, lock icon overlay
- **rolling**: `.yahtzee-die--rolling` — CSS keyframe animation `yahtzee-roll` (rapid face flicker via counter increment or alternating content), 600ms duration

## Scorecard layout for 6+ players
- `<table>` with sticky `position: sticky; left: 0` for the category label column
- Player columns: min-width 70px, overflow-x: auto on the table wrapper
- Section dividers: upper / lower separation with a `<tr class="yahtzee-score__section-header">` row
- Bonus row (upper ≥63 → +35) displayed inline in upper section
- Available categories shown with `.yahtzee-score__cell--available` (hover highlight, pointer cursor)
- Already scored: `.yahtzee-score__cell--scored` (dim, no interaction)
- Current player's column: `.yahtzee-score__col--active` (subtle gold left border on each cell)

## Player selection in setup form
- Checkboxes pull from `onlineUserIds` + `gameState.participants` to show only who is currently in session
- "GM-controlled seats" number input (0–4), each rendered as "NPC Seat 1..4" in scorecad
- "Start game" button disabled until at least 2 total seats selected
- Back link (← arrow) to return to game list without starting

## WebSocket broadcasting
- GM triggers game start → backend emits `MINIGAME_STARTED {gameId, type, state}`
- All clients receive event → `GameSession.jsx` sets `minigameState` in component state
- `minigameState !== null` → renders `YahtzeeBoard` modal for ALL clients (players see it read-only except their own turn)
- On game end: `MINIGAME_ENDED {winner}` → modal closes, toast shown via existing log pattern

## i18n key namespace
All keys under `minigames.*` prefix in both locales.
Key examples: `minigames.tabLabel`, `minigames.yahtzee.title`, `minigames.yahtzee.rollDice`,
`minigames.yahtzee.hold`, `minigames.yahtzee.yourTurn`, `minigames.yahtzee.rollsLeft`,
`minigames.yahtzee.endGame`, `minigames.setup.selectPlayers`, `minigames.setup.gmSeats`,
`minigames.setup.startGame`, scorecard category keys under `minigames.yahtzee.categories.*`
