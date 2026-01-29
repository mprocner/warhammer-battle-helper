package main

import (
	_ "battle-helper/api"
	"battle-helper/internal/config"
	"battle-helper/internal/config/helpers"
	"battle-helper/internal/http"
	"battle-helper/internal/http/requests"
	"battle-helper/internal/repository"
	"battle-helper/internal/service"
	"battle-helper/internal/storage"
	"battle-helper/internal/websocket"
	"fmt"
	nethttp "net/http"
	"os"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
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

	// Connect to MongoDB
	db, err := config.ConnectDatabase()
	if err != nil {
		panic(fmt.Sprintf("Failed to connect to database: %v", err))
	}
	defer db.Disconnect()

	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:3000", "https://*.ngrok-free.dev", "https://*.loca.lt"},
		AllowMethods:     []string{"GET", "PUT", "POST", "DELETE", "OPTIONS"},
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

	r.GET("/", handleHome)
	r.GET("/health", handleHealth)
	r.GET("/characters", handleCharactersHandler(charRepo))
	r.POST("/fight", handleFightHandler(charRepo))
	r.POST("/roll", handleRoll)

	// --- AUTH ---
	authHandler := http.AuthHandler{UserRepo: userRepo}
	r.POST("/register", authHandler.Register)
	r.POST("/login", authHandler.Login)
	// --- END AUTH ---

	// --- PROTECTED ---
	characterHandler := http.CharacterHandler{CharacterRepo: charRepo}

	r.GET("/profile", http.JWTAuthMiddleware(), func(c *gin.Context) {
		token, _ := c.Get("jwt")
		if claims, ok := token.(*jwt.Token).Claims.(jwt.MapClaims); ok {
			email := claims["email"].(string)
			userID := claims["user_id"].(string)
			c.JSON(nethttp.StatusOK, gin.H{"email": email, "user_id": userID})
			return
		}
		c.JSON(nethttp.StatusInternalServerError, gin.H{"error": "Invalid token claims"})
	})

	r.GET("/my-characters", http.JWTAuthMiddleware(), characterHandler.GetMyCharacters)
	r.POST("/my-characters", http.JWTAuthMiddleware(), characterHandler.CreateCharacter)
	r.PUT("/characters/:id", http.JWTAuthMiddleware(), characterHandler.UpdateCharacter)

	// --- GAME ROUTES ---
	gameHandler := http.GameHandler{GameService: gameService, Hub: hub}

	// Public game routes
	r.GET("/games", gameHandler.GetGames)
	r.GET("/games/:id", gameHandler.GetGame)

	// Protected game routes
	r.POST("/games", http.JWTAuthMiddleware(), gameHandler.CreateGame)
	r.POST("/games/:id/join", http.JWTAuthMiddleware(), gameHandler.JoinGame)
	r.POST("/games/:id/leave", http.JWTAuthMiddleware(), gameHandler.LeaveGame)
	r.POST("/games/:id/characters", http.JWTAuthMiddleware(), gameHandler.AddCharacter)
	r.PUT("/games/:id/characters/move", http.JWTAuthMiddleware(), gameHandler.MoveCharacter)
	r.DELETE("/games/:id/characters/:characterId", http.JWTAuthMiddleware(), gameHandler.RemoveCharacter)
	r.POST("/games/:id/fight", http.JWTAuthMiddleware(), gameHandler.Fight)
	r.POST("/games/:id/roll", http.JWTAuthMiddleware(), gameHandler.RollDice)
	r.POST("/games/:id/rollSkill", http.JWTAuthMiddleware(), gameHandler.RollSkill)

	// WebSocket route
	r.GET("/games/:id/ws", gameHandler.HandleWebSocket)
	// --- END GAME ROUTES ---

	// --- AVATAR ROUTES ---
	avatarHandler := http.AvatarHandler{Storage: avatarStorage}
	r.POST("/avatars", http.JWTAuthMiddleware(), avatarHandler.UploadAvatar)
	r.GET("/avatars/:filename", avatarHandler.GetAvatar)
	// --- END AVATAR ROUTES ---
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

// @Summary Lista postaci
// @Description Pobiera listę wszystkich postaci z plików JSON
// @Tags characters
// @Produce json
// @Success 200 {object} string "Lista postaci w formacie JSON"
// @Failure 500 {string} string "Error scanning directory"
// @Router /characters [get]
func handleCharactersHandler(repo *repository.CharactersRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		fmt.Println("Fetching characters from MongoDB...")
		characters, err := repo.GetAll()
		if err != nil {
			c.JSON(nethttp.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(nethttp.StatusOK, characters)
	}
}

// @Summary Atak
// @Description Pobiera listę wszystkich postaci z plików JSON
// @Tags characters
// @Produce json
// @Success 200 {object} string "Lista postaci w formacie JSON"
// @Failure 500 {string} string "Error scanning directory"
// @Router /characters [get]
func handleFightHandler(repo *repository.CharactersRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		request := new(requests.FightRequest)
		if err := c.ShouldBindJSON(request); err != nil {
			c.JSON(nethttp.StatusBadRequest, gin.H{"error": "Invalid request format: " + err.Error()})
			return
		}
		fightService := service.NewFightService(repo)
		response := fightService.Fight(*request)
		c.JSON(nethttp.StatusOK, response)
	}
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
