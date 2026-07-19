package websocket

const (
	// Game state
	EventGameState        = "GAME_STATE"
	EventGameDeleted      = "GAME_DELETED"
	EventGameImageUpdated = "GAME_IMAGE_UPDATED"

	// Participants
	EventParticipantJoined  = "PARTICIPANT_JOINED"
	EventParticipantLeft    = "PARTICIPANT_LEFT"
	EventParticipantUpdated = "PARTICIPANT_UPDATED"
	EventUsersOnline        = "USERS_ONLINE"

	// Characters (grid)
	EventCharacterAdded             = "CHARACTER_ADDED"
	EventCharacterMoved             = "CHARACTER_MOVED"
	EventCharacterRemoved           = "CHARACTER_REMOVED"
	EventCharacterUpdated           = "CHARACTER_UPDATED"
	EventCharacterVisibilityUpdated = "CHARACTER_VISIBILITY_UPDATED"

	// Rolls
	EventDiceRolled   = "DICE_ROLLED"
	EventSkillRolled  = "SKILL_ROLLED"
	EventWeaponRolled = "WEAPON_ROLLED"

	// Messages
	EventLogMessage = "LOG_MESSAGE"

	// Handouts
	EventHandoutCreated          = "HANDOUT_CREATED"
	EventHandoutUpdated          = "HANDOUT_UPDATED"
	EventHandoutDeleted          = "HANDOUT_DELETED"
	EventHandoutMoved            = "HANDOUT_MOVED"
	EventHandoutsReordered       = "HANDOUTS_REORDERED"
	EventHandoutFolderCreated    = "HANDOUT_FOLDER_CREATED"
	EventHandoutFolderUpdated    = "HANDOUT_FOLDER_UPDATED"
	EventHandoutFolderDeleted    = "HANDOUT_FOLDER_DELETED"
	EventHandoutFoldersReordered = "HANDOUT_FOLDERS_REORDERED"

	// Scenes
	EventSceneCreated       = "SCENE_CREATED"
	EventSceneUpdated       = "SCENE_UPDATED"
	EventSceneDeleted       = "SCENE_DELETED"
	EventPlayerSceneChanged = "PLAYER_SCENE_CHANGED"

	// Scene characters
	EventSceneCharacterAdded   = "SCENE_CHARACTER_ADDED"
	EventSceneCharacterMoved   = "SCENE_CHARACTER_MOVED"
	EventSceneCharacterRemoved = "SCENE_CHARACTER_REMOVED"

	// Scene images
	EventSceneImageAdded        = "SCENE_IMAGE_ADDED"
	EventSceneImageUpdated      = "SCENE_IMAGE_UPDATED"
	EventSceneImageDeleted      = "SCENE_IMAGE_DELETED"
	EventSceneImageTokenUpdated = "SCENE_IMAGE_TOKEN_UPDATED"

	// Fog of war
	EventFogToggled     = "FOG_TOGGLED"
	EventFogPathAdded   = "FOG_PATH_ADDED"
	EventFogPathRemoved = "FOG_PATH_REMOVED"
	EventFogCleared     = "FOG_CLEARED"
	EventFogRevealedAll = "FOG_REVEALED_ALL"

	// Drawing
	EventDrawingPathAdded   = "DRAWING_PATH_ADDED"
	EventDrawingPathRemoved = "DRAWING_PATH_REMOVED"
	EventDrawingCleared     = "DRAWING_CLEARED"

	// Notes
	EventNoteCreated = "NOTE_CREATED"
	EventNoteUpdated = "NOTE_UPDATED"
	EventNoteDeleted = "NOTE_DELETED"

	// Music
	EventMusicPlay   = "MUSIC_PLAY"
	EventMusicPause  = "MUSIC_PAUSE"
	EventMusicStop   = "MUSIC_STOP"
	EventMusicVolume = "MUSIC_VOLUME"
	EventMusicLoop   = "MUSIC_LOOP"

	// Token display config (per-user singleton, resolve-on-read)
	EventTokenConfigUpdated = "TOKEN_CONFIG_UPDATED"

	// Minigames
	EventMinigameStarted      = "MINIGAME_STARTED"
	EventMinigameStateUpdated = "MINIGAME_STATE_UPDATED"
	EventMinigameEnded        = "MINIGAME_ENDED"
)
