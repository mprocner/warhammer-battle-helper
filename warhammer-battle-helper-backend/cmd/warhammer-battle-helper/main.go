package main

import (
	_ "battle-helper/api"
	"battle-helper/internal/config"
	"battle-helper/internal/config/helpers"
	"battle-helper/internal/email"
	"battle-helper/internal/features"
	"battle-helper/internal/http"
	"battle-helper/internal/http/requests"
	"battle-helper/internal/repository"
	"battle-helper/internal/service"
	"battle-helper/internal/storage"
	"battle-helper/internal/websocket"
	"fmt"
	nethttp "net/http"
	"os"
	"strings"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

// @title Battle Helper API
// @version 1.0
// @description API do obsługi systemu Battle Helper
// @host localhost:80801
// @BasePath /
func main() {
	// --- JWT KEYS ---
	helpers.LoadJWTKeys("./keys/private.pem", "./keys/public.pem")
	// --- END JWT KEYS ---

	// --- AVATAR STORAGE ---
	avatarsPath := os.Getenv("AVATARS_PATH")
	if avatarsPath == "" {
		avatarsPath = "./avatars"
	}
	avatarStorage, err := storage.NewLocalStorage(avatarsPath, "/avatars")
	if err != nil {
		panic(fmt.Sprintf("Failed to initialize avatar storage: %v", err))
	}
	// --- END AVATAR STORAGE ---

	// --- USER FILES STORAGE ---
	userFilesPath := os.Getenv("USER_FILES_PATH")
	if userFilesPath == "" {
		userFilesPath = "./user-files"
	}
	userFilesStorage, err := storage.NewLocalStorage(userFilesPath, "/user-files")
	if err != nil {
		panic(fmt.Sprintf("Failed to initialize user files storage: %v", err))
	}
	// --- END USER FILES STORAGE ---

	// --- MUSIC FILES STORAGE ---
	musicFilesPath := os.Getenv("MUSIC_FILES_PATH")
	if musicFilesPath == "" {
		musicFilesPath = "./music-files"
	}
	musicFilesStorage, err := storage.NewLocalStorage(musicFilesPath, "/music-files")
	if err != nil {
		panic(fmt.Sprintf("Failed to initialize music files storage: %v", err))
	}
	// --- END MUSIC FILES STORAGE ---

	// Connect to MongoDB
	db, err := config.ConnectDatabase()
	if err != nil {
		panic(fmt.Sprintf("Failed to connect to database: %v", err))
	}
	defer db.Disconnect()

	r := gin.Default()

	// Build allowed origins from environment + defaults
	allowedOrigins := []string{"http://localhost:3000", "http://localhost:3001", "https://*.ngrok-free.dev", "https://*.loca.lt"}
	if extraOrigins := os.Getenv("ALLOWED_ORIGINS"); extraOrigins != "" {
		for _, origin := range strings.Split(extraOrigins, ",") {
			origin = strings.TrimSpace(origin)
			if origin != "" {
				allowedOrigins = append(allowedOrigins, origin)
			}
		}
	}

	r.Use(cors.New(cors.Config{
		AllowOrigins:     allowedOrigins,
		AllowMethods:     []string{"GET", "PUT", "POST", "DELETE", "PATCH", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization", "ngrok-skip-browser-warning"},
		AllowCredentials: true,
		AllowWildcard:    true,
	}))

	// Initialize repositories
	charRepo := repository.NewCharactersRepository(db.CharactersCollection)
	userRepo := repository.NewUserRepository(db.UsersCollection)
	gameRepo := repository.NewGameRepository(db.GamesCollection)
	templateRepo := repository.NewTemplateRepository(db.SystemTemplatesCollection)
	templateService := service.NewTemplateService(templateRepo)
	templateHandler := http.TemplateHandler{TemplateService: templateService}
	statsRepo := repository.NewRollStatsRepository(db.RollStatsCollection)
	if err := statsRepo.EnsureIndexes(); err != nil {
		fmt.Printf("WARNING: failed to create roll_stats indexes: %v\n", err)
	}
	sessionRepo := repository.NewOnlineSessionRepository(db.OnlineSessionsCollection)
	if err := sessionRepo.EnsureIndexes(); err != nil {
		fmt.Printf("WARNING: failed to create online_sessions indexes: %v\n", err)
	}
	sessionService := service.NewOnlineSessionService(sessionRepo)

	// Close orphaned sessions from previous server run
	sessionService.CloseAll()

	// Initialize WebSocket hub
	hub := websocket.NewHub()
	hub.SetSessionTracker(sessionService)
	go hub.Run()

	// Initialize services
	gameService := service.NewGameService(gameRepo, userRepo, charRepo, hub, statsRepo, sessionRepo)

	fogRepo := repository.NewFogRepository(db.GamesCollection)
	fogService := service.NewFogService(fogRepo, hub)

	drawingRepo := repository.NewDrawingRepository(db.GamesCollection)
	drawingService := service.NewDrawingService(drawingRepo, hub)

	noteRepo := repository.NewNoteRepository(db.GamesCollection)
	noteService := service.NewNoteService(noteRepo, hub)

	yahtzeeService := service.NewYahtzeeService(gameRepo, hub)
	dicePokerService := service.NewDicePokerService(gameRepo, hub)

	r.GET("/", handleHome)
	r.GET("/health", handleHealth)
	r.POST("/roll", handleRoll)

	// --- AUTH (public) ---
	emailService := email.NewEmailService()
	authHandler := http.AuthHandler{UserRepo: userRepo, EmailService: emailService}
	r.POST("/register", authHandler.Register)
	r.POST("/login", authHandler.Login)
	r.GET("/verify-email", authHandler.VerifyEmail)
	r.POST("/forgot-password", authHandler.ForgotPassword)
	r.POST("/reset-password", authHandler.ResetPassword)

	// Static file serving (no auth)
	avatarHandler := http.AvatarHandler{Storage: avatarStorage}
	r.GET("/avatars/:filename", avatarHandler.GetAvatar)

	fileHandler := http.FileHandler{UserRepo: userRepo, Storage: userFilesStorage, GameRepo: gameRepo, Hub: hub}
	r.GET("/user-files/:filename", fileHandler.GetFile)

	musicHandler := http.MusicHandler{UserRepo: userRepo, Storage: musicFilesStorage, GameService: gameService}
	r.GET("/music-files/:filename", musicHandler.GetMusicFile)

	handoutHandler := http.HandoutHandler{GameService: gameService, Storage: avatarStorage}
	r.GET("/handouts/:filename", handoutHandler.GetHandoutFile)

	// --- FEATURE TOGGLES ---
	ft := features.Load("./feature-toggles.json")

	// GET /games/:id is JWT-optional (event visibility filtering)
	gameHandler := http.GameHandler{GameService: gameService, TemplateService: templateService, Hub: hub, FeatureToggles: ft}
	statsHandler := http.StatsHandler{StatsRepo: statsRepo, SessionService: sessionService}
	r.GET("/features", http.JWTOptionalMiddleware(), gameHandler.GetFeatures)
	r.GET("/games/:id", http.JWTOptionalMiddleware(), gameHandler.GetGame)

	// WebSocket (auth handled inside handler via token query param)
	r.GET("/games/:id/ws", gameHandler.HandleWebSocket)

	// --- PROTECTED (JWT required for all routes below) ---
	auth := r.Group("/").Use(http.JWTAuthMiddleware())

	// Profile & settings
	auth.PATCH("/change-password", authHandler.ChangePassword)
	auth.GET("/profile", authHandler.GetProfile)
	auth.PATCH("/profile", authHandler.UpdateProfile)
	auth.GET("/profile/roll-stats", statsHandler.GetUserStats)
	auth.GET("/profile/online-stats", statsHandler.GetUserOnlineStats)
	auth.GET("/settings", authHandler.GetSettings)
	auth.PATCH("/settings", authHandler.UpdateSettings)

	// Avatar upload
	auth.POST("/avatars", avatarHandler.UploadAvatar)

	// System templates (custom creator)
	auth.GET("/templates", templateHandler.ListTemplates)
	auth.POST("/templates", templateHandler.CreateTemplate)
	auth.GET("/templates/:id", templateHandler.GetTemplate)
	auth.PATCH("/templates/:id", templateHandler.UpdateTemplate)
	auth.POST("/templates/:id/clone", templateHandler.CloneTemplate)
	auth.DELETE("/templates/:id", templateHandler.DeleteTemplate)

	// Games
	auth.GET("/games", gameHandler.GetGames)
	auth.POST("/games", gameHandler.CreateGame)

	// Per-game actions
	characterHandler := http.CharacterHandler{CharacterRepo: charRepo, GameRepo: gameRepo, Hub: hub}
	sceneHandler := http.SceneHandler{GameService: gameService}
	fogHandler := http.FogHandler{FogService: fogService}
	drawingHandler := http.DrawingHandler{DrawingService: drawingService}
	noteHandler := http.NoteHandler{NoteService: noteService}
	minigameHandler := http.MinigameHandler{YahtzeeService: yahtzeeService, DicePokerService: dicePokerService}

	game := r.Group("/games/:id").Use(http.JWTAuthMiddleware())

	game.DELETE("", gameHandler.DeleteGame)
	game.POST("/invite", gameHandler.InvitePlayer)
	game.POST("/join", gameHandler.JoinGame)
	game.POST("/leave", gameHandler.LeaveGame)
	game.DELETE("/participants/:userId", gameHandler.KickPlayer)
	game.PATCH("/participant", gameHandler.UpdateParticipant)
	game.POST("/roll", gameHandler.RollDice)
	game.POST("/rollSkill", gameHandler.RollSkill)
	game.POST("/rollWeapon", gameHandler.RollWeapon)
	game.POST("/syncTemplate", gameHandler.SyncTemplate)
	game.GET("/roll-stats", statsHandler.GetGameStats)
	game.GET("/online-stats", statsHandler.GetOnlineStats)
	game.POST("/message", gameHandler.SendMessage)

	// Characters
	game.GET("/characters", characterHandler.GetGameCharacters)
	game.POST("/characters", characterHandler.CreateGameCharacter)
	game.PUT("/characters/:charId", characterHandler.UpdateGameCharacter)
	game.DELETE("/characters/:charId", characterHandler.DeleteGameCharacter)
	game.POST("/characters/:charId/clone", characterHandler.CloneGameCharacter)
	game.PUT("/characters/:charId/visibility", characterHandler.UpdateCharacterVisibility)

	// Scenes
	game.GET("/scenes", sceneHandler.GetScenes)
	game.POST("/scenes", sceneHandler.CreateScene)
	game.PUT("/scenes/:sceneId", sceneHandler.UpdateScene)
	game.DELETE("/scenes/:sceneId", sceneHandler.DeleteScene)
	game.PUT("/scenes/:sceneId/assign", sceneHandler.AssignPlayerToScene)
	game.POST("/scenes/:sceneId/characters", sceneHandler.AddSceneCharacter)
	game.PUT("/scenes/:sceneId/characters/move", sceneHandler.MoveSceneCharacter)
	game.DELETE("/scenes/:sceneId/characters/:charId", sceneHandler.RemoveSceneCharacter)
	game.POST("/scenes/:sceneId/images", sceneHandler.AddSceneImage)
	game.PUT("/scenes/:sceneId/images/:imageId", sceneHandler.UpdateSceneImage)
	game.DELETE("/scenes/:sceneId/images/:imageId", sceneHandler.DeleteSceneImage)

	// Fog of war
	game.PATCH("/scenes/:sceneId/fog", fogHandler.ToggleFog)
	game.POST("/scenes/:sceneId/fog/path", fogHandler.AddFogPath)
	game.DELETE("/scenes/:sceneId/fog/paths", fogHandler.ClearFogPaths)
	game.DELETE("/scenes/:sceneId/fog/path/last", fogHandler.UndoLastFogPath)
	game.POST("/scenes/:sceneId/fog/reveal-all", fogHandler.RevealAllFog)

	// Drawing
	game.POST("/scenes/:sceneId/drawing/path", drawingHandler.AddDrawingPath)
	game.DELETE("/scenes/:sceneId/drawing/path/last", drawingHandler.UndoLastDrawingPath)
	game.DELETE("/scenes/:sceneId/drawing/path/:pathId", drawingHandler.DeleteDrawingPath)
	game.DELETE("/scenes/:sceneId/drawing/paths", drawingHandler.ClearDrawingPaths)

	// Handouts
	game.POST("/handouts/upload", handoutHandler.UploadHandoutFile)
	game.POST("/handouts", handoutHandler.CreateHandout)
	game.GET("/handouts", handoutHandler.GetHandouts)
	game.PUT("/handouts/reorder", handoutHandler.ReorderHandouts)
	game.PUT("/handouts/:handoutId/move", handoutHandler.MoveHandout)
	game.PUT("/handouts/:handoutId", handoutHandler.UpdateHandout)
	game.DELETE("/handouts/:handoutId", handoutHandler.DeleteHandout)
	game.POST("/handout-folders", handoutHandler.CreateHandoutFolder)
	game.PUT("/handout-folders/reorder", handoutHandler.ReorderHandoutFolders)
	game.PUT("/handout-folders/:folderId", handoutHandler.RenameHandoutFolder)
	game.DELETE("/handout-folders/:folderId", handoutHandler.DeleteHandoutFolder)

	// Notes
	game.POST("/notes", noteHandler.CreateNote)
	game.GET("/notes", noteHandler.GetNotes)
	game.PUT("/notes/reorder", noteHandler.ReorderNotes)
	game.PUT("/notes/:noteId", noteHandler.UpdateNote)
	game.DELETE("/notes/:noteId", noteHandler.DeleteNote)

	// Minigames
	game.POST("/minigame/start", minigameHandler.Start)
	game.DELETE("/minigame", minigameHandler.End)
	game.GET("/minigame", minigameHandler.GetState)
	game.POST("/minigame/roll", minigameHandler.Roll)
	game.PATCH("/minigame/held", minigameHandler.SetHeld)
	game.POST("/minigame/score", minigameHandler.Score)
	game.POST("/minigame/confirm", minigameHandler.Confirm)
	game.POST("/minigame/next-round", minigameHandler.NextRound)

	// Music playback (game-scoped)
	game.POST("/music/play", musicHandler.PlayTrack)
	game.POST("/music/pause", musicHandler.PauseTrack)
	game.POST("/music/stop", musicHandler.StopTrack)
	game.POST("/music/volume", musicHandler.SetVolume)
	game.POST("/music/next", musicHandler.NextTrack)
	game.PATCH("/music/loop", musicHandler.SetLoop)

	// User files
	auth.GET("/files", fileHandler.GetFiles)
	auth.POST("/files/upload", fileHandler.UploadFiles)
	auth.DELETE("/files/:fileId", fileHandler.DeleteFile)
	auth.GET("/files/:fileId/usage", fileHandler.GetFileUsage)
	auth.PUT("/files/:fileId/move", fileHandler.MoveFile)
	auth.PUT("/files/:fileId/rename", fileHandler.RenameFile)
	auth.POST("/folders", fileHandler.CreateFolder)
	auth.PUT("/folders/:folderId", fileHandler.RenameFolder)
	auth.DELETE("/folders/:folderId", fileHandler.DeleteFolder)

	// Music library
	auth.GET("/music", musicHandler.GetMusic)
	auth.POST("/music/upload", musicHandler.UploadMusic)
	auth.DELETE("/music/:musicId", musicHandler.DeleteMusic)
	auth.PUT("/music/:musicId/move", musicHandler.MoveMusicFile)
	auth.PUT("/music/:musicId/rename", musicHandler.RenameMusicFile)
	auth.POST("/music/folders", musicHandler.CreateMusicFolder)
	auth.PUT("/music/folders/:folderId", musicHandler.RenameMusicFolder)
	auth.DELETE("/music/folders/:folderId", musicHandler.DeleteMusicFolder)
	auth.POST("/playlists", musicHandler.CreatePlaylist)
	auth.PUT("/playlists/:playlistId", musicHandler.UpdatePlaylist)
	auth.DELETE("/playlists/:playlistId", musicHandler.DeletePlaylist)
	auth.PUT("/playlists/reorder", musicHandler.ReorderPlaylists)
	// --- ADMIN (JWT + isAdmin required) ---
	adminRepo := repository.NewAdminRepository(db.UsersCollection, db.GamesCollection, db.OnlineSessionsCollection)
	adminHandler := http.AdminHandler{AdminRepo: adminRepo}
	admin := r.Group("/admin").Use(http.JWTAuthMiddleware(), http.AdminAuthMiddleware())
	admin.GET("/users", adminHandler.ListUsers)
	admin.GET("/users/:id", adminHandler.GetUser)
	admin.PATCH("/users/:id", adminHandler.UpdateUser)
	admin.DELETE("/users/:id", adminHandler.DeleteUser)
	admin.GET("/games", adminHandler.ListGames)
	admin.GET("/games/:id", adminHandler.GetGame)
	admin.DELETE("/games/:id", adminHandler.DeleteGame)
	admin.GET("/stats/storage", adminHandler.StorageStats)
	admin.GET("/stats/sessions", adminHandler.SessionStats)
	// --- END ADMIN ---

	httpPort := os.Getenv("PORT")
	if httpPort == "" {
		httpPort = "8080"
	}

	r.Run(":" + httpPort)
}

// @Summary Strona główna
// @Description Zwraca powitalne przesłanie
// @Tags główne
// @Produce plain
// @Success 200 {string} string "Dzień dobry!!"
// @Router / [get]
func handleHome(c *gin.Context) {
	c.String(nethttp.StatusOK, "Dzień dobry!!")
}

// @Summary Sprawdzenie stanu zdrowia
// @Description Sprawdza stan zdrowia aplikacji
// @Tags health
// @Produce plain
// @Success 200 {string} string "Health is OK!!"
// @Router /health [get]
func handleHealth(c *gin.Context) {
	c.String(nethttp.StatusOK, "Health is OK!!")
}

func handleRoll(c *gin.Context) {
	request := new(requests.RollRequest)
	if err := c.ShouldBindJSON(request); err != nil {
		c.JSON(nethttp.StatusBadRequest, gin.H{"error": "Invalid request format: " + err.Error()})
		return
	}
	if request.Sides < 1 {
		c.JSON(nethttp.StatusBadRequest, gin.H{"error": "Sides must be greater than 0"})
		return
	}
	rolls := service.Dice{Sizes: request.Sides}
	result := rolls.Roll()
	c.JSON(nethttp.StatusOK, map[string]int{
		"result": result,
	})
}
