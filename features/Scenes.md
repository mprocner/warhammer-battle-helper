# Scenes and Layers System - Technical Specification
## Scenes
- Only Game master (GM) has access to scene settings.
- The "Scenes" tab in the options panel is visible only to GM.
- Scene settings are hidden from players.

- GM can create unlimited scenes.
- GM can switch players between scenes.
- Players can be on different scenes simultaneously.
- Each player sees only their assigned scene.
- Scene should be display in the central area of the application. Add wrapper to fight-grid element and it will be the scene display area.

### Scenes configuration
- Grid visibility: toggle on/off
- Width: number of cells horizontally
- Height: number of cells vertically
- Default settings: 20x20
- width and height settings defines fight-grid grid size for new scenes (single element is .fight-zone).

## Layers
- Each scene consists of 2 layers:
### Layer 1: Background (Background/Map Layer)
- Purpose: Maps, location images, static scenery elements
- Functionality:
  - canvas element could be used for rendering this layer which should be the same size like fight-grid area (think if it's a good idea)
  - GM can add, move, resize images
  - Support for multiple images simultaneously
  - it should be possible to set settings for each image on right click (in popup)
    - Z-index system for determining stacking order of objects
  - GM can move images between GM layer and Background layer (right click on image and choose "Move to GM layer" or "Move to Background layer")

### Layer 2: GM (Game Master Layer)
- Only visible to GM
- GM can't make it visible to players
- the same purpose and functionality as Background layer
- GM can move images between GM layer and Background layer (right click on image and choose "Move to GM layer" or "Move to Background layer")


