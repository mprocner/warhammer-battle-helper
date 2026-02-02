# Description
I want to implement scenes feature in application. 
It should be located in Options panel as a separate tab called "Scenes". There is already file ScenesTab.jsx. This tab should be only visible to GameMaster (GM).
GameMaster (GM) should be able to:
- create scenes,
- edit scenes
- delete scenes
- set current scene for specific players. Could be different scenes for different players.
Each scene should have:
- ***Layers? (background, tokens, GM)***
- upload background images for them, 
- set grid visibility on/off, 
- set grid size (width and height in number - default 20x20). 
- it's own tokens positions (tokens positions should be saved per scene - now tokens are saved per game)


Players should be able to see only the current scene set by GM.


# Files
I want to implement files management feature in application. 
It should be located in Options panel as a separate tab called "Files". Create new file FilesTab.jsx for it.
GameMaster (GM) should be able to upload files/images to the files repository and delete them. 
Files should be stored in the backend and associated with the user account. 
GM could create file folders to organize files.
