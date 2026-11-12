# The game screen

The game screen has four main parts:

| Part | What is there |
|---|---|
| **Character list and card** (left) | Player characters and, for the GM, the NPC list. Clicking a tile shows a short card with key stats and quick rolls |
| **Map** (centre) | The current scene with tokens, fog of war and drawings |
| **Side panel** (right) | Tabs: Chat, Scenes, Handouts, Files, Music, Notes, Players, Games, General. Players see only Chat, Handouts, Notes and General |
| **Top bar** | Who is in the game (a lit avatar means connected) and minimised windows |

Character sheets, handouts and notes open in separate windows you can move around. A
minimised window is parked in the top bar, so nothing gets lost behind the map. You can also
open a character sheet in its own browser tab (the scroll icon next to the name), which is
handy on a second screen.

## Map controls {#map-controls}

Pick a scheme in the **General** tab:

| | Modern | Classic |
|---|---|---|
| Zoom | mouse wheel | Ctrl + wheel |
| Pan the map | drag with the right button | wheel, or drag with the right button |

In both schemes:
- left-click selects a token, dragging moves it,
- dragging across empty map selects several tokens at once (hold Shift to add to the selection),
- the middle mouse button cycles through the tools.

## Map tools {#map-tools}

| Tool | Who | What for |
|---|---|---|
| **Select / Move** | everyone | Select, move, rotate and resize tokens |
| **Measure distance** | everyone | A ruler in game units, optionally with an area of effect. Others see your ruler live |
| **Fog of War** | GM | Hide and reveal parts of the map from players |
| **Drawing** | everyone | Freehand, line, rectangle, circle, arrow, polygon and text, visible to everyone |

**Layers.** The map is stacked from layers: tokens, the GM layer (only the GM sees it) and the
background. Moving or deleting images only affects the layer picked in the layer selector (icons on
the right; hover one to see the layer name).
Drawing is not limited to it.

**Ping.** Hold the left button still on an empty spot of the map for about half a second.
Everyone sees a marker there.

## Turn order {#turn-order}

**GM.** The button with two fighters in the tool bar (after the divider) starts combat on the
current scene. Combat starts hidden: add participants, enter initiative and click
**Show** (the eye) in the Combat window. Add participants from the Combat window or with a right click on a token (an
image has **Add to combat** in its menu; select a character token first, then right-click it).

In the Combat window, under **Add participants** below the turn order, candidates are always
shown, grouped and sorted alphabetically; a group disappears once
all of it is in combat. A click adds one participant, **All** next to the heading adds the whole
group:

- **Characters** — player characters from the left panel, on the map or not. A character is always
  one entry: when it is active, all its tokens on the scene light up.
- **NPCs** — non-player characters from the left panel, also one entry per character. The entry
  does not hide along with its token — hide a hidden NPC with the eye next to the entry.
- **Tokens** — tokens-layer images on the map.
- **Manual entry** — just a name and initiative.

- Order follows initiative (highest first); drag a row to break a tie.
- Click a participant to make them active — turns do not have to go in order.
- **Next turn** marks the active participant as done and moves to the next one who has not acted.
  **End round** clears the marks and advances the round counter.
- Run a prepared combat from the strip over the map without opening the window: the arrow is
  **Next turn**, and once everyone has acted it turns into a gold **End round** button (hover for
  a description). Clicking a portrait gives that participant the turn.
- The eye next to a participant hides them from players (ambush). Players never see initiative values.
- Every scene has its own combat; a scene with combat in progress shows an icon next to its name.
- **End combat** clears the turn order.

**Player.** During combat the turn order shows above the map. When your character's turn comes,
the combat button pulses green and **End turn** appears on the bar. Drag the bar by its handle
anywhere on the screen, side panels included (double-click the handle to bring it back over the
map), or collapse it with the combat button.

## Tutorials {#tutorials}

The game-screen tutorial starts on your first visit. Replay it with the question mark in the
panel header. Next to it, the book opens this guide and the star opens the changelog
(**What's new**), both in a new tab. Point at an icon and its name
shows right away. Contact, the terms, the privacy policy and the licenses are
at the very bottom of the **General** tab, under **Site links**. Tabs have their own short tutorials. A tutorial bubble has a **Read more in the
help** link that opens the matching section of this guide in a new tab, so the game stays where
it was.
