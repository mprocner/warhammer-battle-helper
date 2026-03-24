package main

import (
	_ "battle-helper/api"
	"battle-helper/internal/config"
	"battle-helper/internal/config/helpers"
	"battle-helper/internal/email"
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
	allowedOrigins := []string{"http://localhost:3000", "https://*.ngrok-free.dev", "https://*.loca.lt"}
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

	// Initialize WebSocket hub
	hub := websocket.NewHub()
	go hub.Run()

	// Initialize services
	gameService := service.NewGameService(gameRepo, userRepo, charRepo, hub)

	fogRepo := repository.NewFogRepository(db.GamesCollection)
	fogService := service.NewFogService(fogRepo, hub)

	drawingRepo := repository.NewDrawingRepository(db.GamesCollection)
	drawingService := service.NewDrawingService(drawingRepo, hub)

	r.GET("/", handleHome)
	r.GET("/health", handleHealth)
	r.POST("/roll", handleRoll)

	// --- AUTH ---
	emailService := email.NewEmailService()
	authHandler := http.AuthHandler{UserRepo: userRepo, EmailService: emailService}
	r.POST("/register", authHandler.Register)
	r.POST("/login", authHandler.Login)
	r.GET("/verify-email", authHandler.VerifyEmail)
	r.POST("/forgot-password", authHandler.ForgotPassword)
	r.POST("/reset-password", authHandler.ResetPassword)
	r.PATCH("/change-password", http.JWTAuthMiddleware(), authHandler.ChangePassword)
	// --- END AUTH ---

	// --- PROTECTED ---
	characterHandler := http.CharacterHandler{CharacterRepo: charRepo, GameRepo: gameRepo, Hub: hub}

	r.GET("/profile", http.JWTAuthMiddleware(), authHandler.GetProfile)
	r.PATCH("/profile", http.JWTAuthMiddleware(), authHandler.UpdateProfile)

	// --- GAME ROUTES ---
	gameHandler := http.GameHandler{GameService: gameService, Hub: hub}

	// Public game routes (JWT optional — used for event visibility filtering)
	r.GET("/games/:id", http.JWTOptionalMiddleware(), gameHandler.GetGame)

	// Protected game routes
	r.GET("/games", http.JWTAuthMiddleware(), gameHandler.GetGames)
	r.POST("/games", http.JWTAuthMiddleware(), gameHandler.CreateGame)
	r.DELETE("/games/:id", http.JWTAuthMiddleware(), gameHandler.DeleteGame)
	r.POST("/games/:id/invite", http.JWTAuthMiddleware(), gameHandler.InvitePlayer)
	r.POST("/games/:id/join", http.JWTAuthMiddleware(), gameHandler.JoinGame)
	r.POST("/games/:id/leave", http.JWTAuthMiddleware(), gameHandler.LeaveGame)
	r.GET("/games/:id/characters", http.JWTAuthMiddleware(), characterHandler.GetGameCharacters)
	r.POST("/games/:id/characters", http.JWTAuthMiddleware(), characterHandler.CreateGameCharacter)
	r.PUT("/games/:id/characters/:charId", http.JWTAuthMiddleware(), characterHandler.UpdateGameCharacter)
	r.DELETE("/games/:id/characters/:charId", http.JWTAuthMiddleware(), characterHandler.DeleteGameCharacter)
	r.POST("/games/:id/characters/:charId/clone", http.JWTAuthMiddleware(), characterHandler.CloneGameCharacter)
	r.PUT("/games/:id/characters/:charId/visibility", http.JWTAuthMiddleware(), characterHandler.UpdateCharacterVisibility)
	r.PATCH("/games/:id/participant", http.JWTAuthMiddleware(), gameHandler.UpdateParticipant)
	r.POST("/games/:id/roll", http.JWTAuthMiddleware(), gameHandler.RollDice)
	r.POST("/games/:id/rollSkill", http.JWTAuthMiddleware(), gameHandler.RollSkill)
	r.POST("/games/:id/rollWeapon", http.JWTAuthMiddleware(), gameHandler.RollWeapon)
	r.POST("/games/:id/message", http.JWTAuthMiddleware(), gameHandler.SendMessage)

	// WebSocket route
	r.GET("/games/:id/ws", gameHandler.HandleWebSocket)

	// --- SCENE ROUTES ---
	sceneHandler := http.SceneHandler{GameService: gameService}
	r.GET("/games/:id/scenes", http.JWTAuthMiddleware(), sceneHandler.GetScenes)
	r.POST("/games/:id/scenes", http.JWTAuthMiddleware(), sceneHandler.CreateScene)
	r.PUT("/games/:id/scenes/:sceneId", http.JWTAuthMiddleware(), sceneHandler.UpdateScene)
	r.DELETE("/games/:id/scenes/:sceneId", http.JWTAuthMiddleware(), sceneHandler.DeleteScene)
	r.PUT("/games/:id/scenes/:sceneId/assign", http.JWTAuthMiddleware(), sceneHandler.AssignPlayerToScene)
	r.POST("/games/:id/scenes/:sceneId/characters", http.JWTAuthMiddleware(), sceneHandler.AddSceneCharacter)
	r.PUT("/games/:id/scenes/:sceneId/characters/move", http.JWTAuthMiddleware(), sceneHandler.MoveSceneCharacter)
	r.DELETE("/games/:id/scenes/:sceneId/characters/:charId", http.JWTAuthMiddleware(), sceneHandler.RemoveSceneCharacter)
	r.POST("/games/:id/scenes/:sceneId/images", http.JWTAuthMiddleware(), sceneHandler.AddSceneImage)
	r.PUT("/games/:id/scenes/:sceneId/images/:imageId", http.JWTAuthMiddleware(), sceneHandler.UpdateSceneImage)
	r.DELETE("/games/:id/scenes/:sceneId/images/:imageId", http.JWTAuthMiddleware(), sceneHandler.DeleteSceneImage)

	// --- FOG OF WAR ROUTES ---
	fogHandler := http.FogHandler{FogService: fogService}
	r.PATCH("/games/:id/scenes/:sceneId/fog", http.JWTAuthMiddleware(), fogHandler.ToggleFog)
	r.POST("/games/:id/scenes/:sceneId/fog/path", http.JWTAuthMiddleware(), fogHandler.AddFogPath)
	r.DELETE("/games/:id/scenes/:sceneId/fog/paths", http.JWTAuthMiddleware(), fogHandler.ClearFogPaths)
	r.DELETE("/games/:id/scenes/:sceneId/fog/path/last", http.JWTAuthMiddleware(), fogHandler.UndoLastFogPath)
	r.POST("/games/:id/scenes/:sceneId/fog/reveal-all", http.JWTAuthMiddleware(), fogHandler.RevealAllFog)
	// --- END FOG OF WAR ROUTES ---

	// --- DRAWING ROUTES ---
	drawingHandler := http.DrawingHandler{DrawingService: drawingService}
	r.POST("/games/:id/scenes/:sceneId/drawing/path", http.JWTAuthMiddleware(), drawingHandler.AddDrawingPath)
	r.DELETE("/games/:id/scenes/:sceneId/drawing/path/last", http.JWTAuthMiddleware(), drawingHandler.UndoLastDrawingPath)
	r.DELETE("/games/:id/scenes/:sceneId/drawing/path/:pathId", http.JWTAuthMiddleware(), drawingHandler.DeleteDrawingPath)
	r.DELETE("/games/:id/scenes/:sceneId/drawing/paths", http.JWTAuthMiddleware(), drawingHandler.ClearDrawingPaths)
	// --- END DRAWING ROUTES ---
	// --- END SCENE ROUTES ---
	// --- END GAME ROUTES ---

	// --- AVATAR ROUTES ---
	avatarHandler := http.AvatarHandler{Storage: avatarStorage}
	r.POST("/avatars", http.JWTAuthMiddleware(), avatarHandler.UploadAvatar)
	r.GET("/avatars/:filename", avatarHandler.GetAvatar)
	// --- END AVATAR ROUTES ---

	// --- HANDOUT ROUTES ---
	handoutHandler := http.HandoutHandler{GameService: gameService, Storage: avatarStorage}
	r.POST("/games/:id/handouts/upload", http.JWTAuthMiddleware(), handoutHandler.UploadHandoutFile)
	r.POST("/games/:id/handouts", http.JWTAuthMiddleware(), handoutHandler.CreateHandout)
	r.GET("/games/:id/handouts", http.JWTAuthMiddleware(), handoutHandler.GetHandouts)
	r.PUT("/games/:id/handouts/reorder", http.JWTAuthMiddleware(), handoutHandler.ReorderHandouts)
	r.PUT("/games/:id/handouts/:handoutId/move", http.JWTAuthMiddleware(), handoutHandler.MoveHandout)
	r.PUT("/games/:id/handouts/:handoutId", http.JWTAuthMiddleware(), handoutHandler.UpdateHandout)
	r.DELETE("/games/:id/handouts/:handoutId", http.JWTAuthMiddleware(), handoutHandler.DeleteHandout)
	r.POST("/games/:id/handout-folders", http.JWTAuthMiddleware(), handoutHandler.CreateHandoutFolder)
	r.PUT("/games/:id/handout-folders/reorder", http.JWTAuthMiddleware(), handoutHandler.ReorderHandoutFolders)
	r.PUT("/games/:id/handout-folders/:folderId", http.JWTAuthMiddleware(), handoutHandler.RenameHandoutFolder)
	r.DELETE("/games/:id/handout-folders/:folderId", http.JWTAuthMiddleware(), handoutHandler.DeleteHandoutFolder)
	r.GET("/handouts/:filename", handoutHandler.GetHandoutFile)
	// --- END HANDOUT ROUTES ---

	// --- USER FILES ROUTES ---
	fileHandler := http.FileHandler{UserRepo: userRepo, Storage: userFilesStorage, GameRepo: gameRepo, Hub: hub}
	r.GET("/files", http.JWTAuthMiddleware(), fileHandler.GetFiles)
	r.POST("/files/upload", http.JWTAuthMiddleware(), fileHandler.UploadFiles)
	r.DELETE("/files/:fileId", http.JWTAuthMiddleware(), fileHandler.DeleteFile)
	r.GET("/files/:fileId/usage", http.JWTAuthMiddleware(), fileHandler.GetFileUsage)
	r.PUT("/files/:fileId/move", http.JWTAuthMiddleware(), fileHandler.MoveFile)
	r.POST("/folders", http.JWTAuthMiddleware(), fileHandler.CreateFolder)
	r.PUT("/folders/:folderId", http.JWTAuthMiddleware(), fileHandler.RenameFolder)
	r.DELETE("/folders/:folderId", http.JWTAuthMiddleware(), fileHandler.DeleteFolder)
	r.GET("/user-files/:filename", fileHandler.GetFile)
	// --- END USER FILES ROUTES ---

	// --- MUSIC ROUTES ---
	musicHandler := http.MusicHandler{UserRepo: userRepo, Storage: musicFilesStorage, GameService: gameService}
	r.GET("/music", http.JWTAuthMiddleware(), musicHandler.GetMusic)
	r.POST("/music/upload", http.JWTAuthMiddleware(), musicHandler.UploadMusic)
	r.DELETE("/music/:musicId", http.JWTAuthMiddleware(), musicHandler.DeleteMusic)
	r.PUT("/music/:musicId/move", http.JWTAuthMiddleware(), musicHandler.MoveMusicFile)
	r.POST("/music/folders", http.JWTAuthMiddleware(), musicHandler.CreateMusicFolder)
	r.PUT("/music/folders/:folderId", http.JWTAuthMiddleware(), musicHandler.RenameMusicFolder)
	r.DELETE("/music/folders/:folderId", http.JWTAuthMiddleware(), musicHandler.DeleteMusicFolder)
	r.GET("/music-files/:filename", musicHandler.GetMusicFile)
	r.POST("/playlists", http.JWTAuthMiddleware(), musicHandler.CreatePlaylist)
	r.PUT("/playlists/:playlistId", http.JWTAuthMiddleware(), musicHandler.UpdatePlaylist)
	r.DELETE("/playlists/:playlistId", http.JWTAuthMiddleware(), musicHandler.DeletePlaylist)
	r.PUT("/playlists/reorder", http.JWTAuthMiddleware(), musicHandler.ReorderPlaylists)
	r.POST("/games/:id/music/play", http.JWTAuthMiddleware(), musicHandler.PlayTrack)
	r.POST("/games/:id/music/pause", http.JWTAuthMiddleware(), musicHandler.PauseTrack)
	r.POST("/games/:id/music/stop", http.JWTAuthMiddleware(), musicHandler.StopTrack)
	r.POST("/games/:id/music/volume", http.JWTAuthMiddleware(), musicHandler.SetVolume)
	// --- END MUSIC ROUTES ---
	// --- END PROTECTED ---

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
