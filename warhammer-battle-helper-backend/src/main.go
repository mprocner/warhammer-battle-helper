package main

import (
	_ "battle-helper/docs"
	"battle-helper/fight"
	"battle-helper/helpers"
	"battle-helper/http"
	"battle-helper/http/requests"
	"battle-helper/infrastructure/repositories"
	"battle-helper/roll"
	"context"
	"fmt"
	nethttp "net/http"
	"os"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	// echoSwagger "github.com/swaggo/echo-swagger" // usunięte, jeśli potrzebny Swagger dla Gin, dodać odpowiedni pakiet
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
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

	// Connect to MongoDB
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	mongoURI := "mongodb://root:example@mongo:27017"
	client, err := mongo.Connect(ctx, options.Client().ApplyURI(mongoURI))
	if err != nil {
		panic(err)
	}
	if err := client.Ping(ctx, nil); err != nil {
		fmt.Println("MongoDB not connected: " + err.Error())
		panic("MongoDB not connected: " + err.Error())
	}
	fmt.Println("Connected to MongoDB!")
	db := client.Database("battle_helper")
	charCollection = db.Collection("characters")
	userCollection := db.Collection("users")

	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:3000"},
		AllowMethods:     []string{"GET", "PUT", "POST", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization"},
		AllowCredentials: true,
	}))

	r.GET("/", handleHome)
	r.GET("/health", handleHealth)
	r.GET("/characters", handleCharacters)
	r.POST("/fight", handleFight)
	r.POST("/roll", handleRoll)

	// --- AUTH ---
	userRepo := repositories.NewUserRepository(userCollection)
	authHandler := http.AuthHandler{UserRepo: userRepo}
	r.POST("/register", authHandler.Register)
	r.POST("/login", authHandler.Login)
	// --- END AUTH ---

	// --- PROTECTED ---
	r.GET("/profile", http.JWTAuthMiddleware(), func(c *gin.Context) {
		token, _ := c.Get("jwt")
		if claims, ok := token.(*jwt.Token).Claims.(jwt.MapClaims); ok {
			email := claims["email"].(string)
			c.JSON(nethttp.StatusOK, gin.H{"email": email})
			return
		}
		c.JSON(nethttp.StatusInternalServerError, gin.H{"error": "Invalid token claims"})
	})
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
var charCollection *mongo.Collection

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
func handleCharacters(c *gin.Context) {
	fmt.Println("Fetching characters from MongoDB...")
	repo := repositories.NewCharactersRepository()
	characters, err := repo.GetAll()
	if err != nil {
		c.JSON(nethttp.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(nethttp.StatusOK, characters)
}

// @Summary Atak
// @Description Pobiera listę wszystkich postaci z plików JSON
// @Tags characters
// @Produce json
// @Success 200 {object} string "Lista postaci w formacie JSON"
// @Failure 500 {string} string "Error scanning directory"
// @Router /characters [get]
func handleFight(c *gin.Context) {
	request := new(requests.FightRequest)
	if err := c.ShouldBindJSON(request); err != nil {
		c.JSON(nethttp.StatusBadRequest, gin.H{"error": "Invalid request format: " + err.Error()})
		return
	}
	fightService := fight.FightService{}
	response := fightService.Fight(*request)
	c.JSON(nethttp.StatusOK, response)
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
	rolls := roll.Dice{Sizes: request.Sides}
	result := rolls.Roll()
	c.JSON(nethttp.StatusOK, map[string]int{
		"result": result,
	})
}
