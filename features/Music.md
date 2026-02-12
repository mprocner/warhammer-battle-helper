# Music management feature - technical specification
## Description
- I want to implement music management feature in application. It should be located in Options panel as a separate tab called "Music". Create new file MusicTab.jsx for it.
- Tab should be only visible to GameMaster (GM).
- GameMaster (GM) should be able to upload music files to the music repository and delete them.
- Only music files (e.g. mp3, wav) are supported.
- Add possibility to upload multiple files at once.
- Music files should be stored in the backend and associated with the user account.
- In database save them in the user document under `music` field as an array.
- Use similar visual design as in other parts of the application, following existing styles and themes.
- GM should be able to play/pause music files directly from the music tab. Add play/pause button next to each file in the list. When music is playing, show also a progress bar indicating current position in the track.
- When music file is played, it should be played for all players in the game. Implement this by sending a message through WebSocket to all connected clients with the information about which track to play and its current position. Clients should then play the track in sync with the GM.
- Add volume control for the music player in the music tab. GM should be able to adjust the volume of the music being played. This setting should also be sent to all clients so that they can adjust the volume accordingly.
- Players also should have possibility to adjust music volume on their end independently from GM's setting. It should be located in general settings tab (GeneralTab). This setting should be stored locally in the client (e.g. in localStorage) so that it persists across sessions.
- GM should have possibility to create playlists by grouping multiple music files together. Implement this by allowing GM to select multiple files and save them as a playlist with a custom name. Playlists should be stored in the backend in the user document under `playlists` field as an array of objects with `name` and `tracks` fields. GM should be able to play/pause entire playlist, and tracks should be played in sequence. When a track ends, the next one should start automatically. Implement this by sending appropriate messages through WebSocket to all clients to keep them in sync with the GM's actions.