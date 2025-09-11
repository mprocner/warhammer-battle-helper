package main

import (
	_ "battle-helper/docs"
	"battle-helper/fight"
	"battle-helper/http/requests"
	"battle-helper/infrastructure/repositories"
	"battle-helper/roll"
	"context"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	echoSwagger "github.com/swaggo/echo-swagger"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:3001")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Credentials", "true")

		// Handle preflight requests
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// @title Battle Helper API
// @version 1.0
// @description API do obsługi systemu Battle Helper
// @host localhost:80801
// @BasePath /
func main() {

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

	e := echo.New()

	// e.GET("/db/characters", func(c echo.Context) error {
	// 	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	// 	defer cancel()
	// 	cursor, err := charCollection.Find(ctx, bson.M{})
	// 	if err != nil {
	// 		return c.JSON(500, map[string]string{"error": err.Error()})
	// 	}
	// 	var all []models.Character
	// 	if err := cursor.All(ctx, &all); err != nil {
	// 		return c.JSON(500, map[string]string{"error": err.Error()})
	// 	}
	// 	return c.JSON(200, all)
	// })
	// add endpoint to list characters
	e.GET("/", handleHome)
	e.GET("/health", handleHealth)
	e.GET("/characters", handleCharacters)
	e.POST("/fight", handleFight)
	e.GET("/swagger/*", echoSwagger.WrapHandler)
	e.POST("/roll", handleRoll)

	httpPort := os.Getenv("PORT")
	if httpPort == "" {
		httpPort = "8080"
	}

	// Konfiguracja CORS
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins:     []string{"http://localhost:3000"},
		AllowMethods:     []string{echo.GET, echo.PUT, echo.POST, echo.DELETE, echo.OPTIONS},
		AllowHeaders:     []string{echo.HeaderOrigin, echo.HeaderContentType, echo.HeaderAccept, echo.HeaderAuthorization},
		AllowCredentials: true,
	}))

	e.Logger.Fatal(e.Start(":" + httpPort))

}

// @Summary Strona główna
// @Description Zwraca powitalne przesłanie
// @Tags główne
// @Produce plain
// @Success 200 {string} string "Dzień dobry!!"
// @Router / [get]
func handleHome(c echo.Context) error {
	return c.String(http.StatusOK, "Dzień dobry!!")
}

// @Summary Sprawdzenie stanu zdrowia
// @Description Sprawdza stan zdrowia aplikacji
// @Tags health
// @Produce plain
// @Success 200 {string} string "Health is OK!!"
// @Router /health [get]
var charCollection *mongo.Collection

func handleHealth(c echo.Context) error {

	return c.String(http.StatusOK, "Health is OK!!")
}

// @Summary Lista postaci
// @Description Pobiera listę wszystkich postaci z plików JSON
// @Tags characters
// @Produce json
// @Success 200 {object} string "Lista postaci w formacie JSON"
// @Failure 500 {string} string "Error scanning directory"
// @Router /characters [get]
func handleCharacters(c echo.Context) error {

	fmt.Println("Fetching characters from MongoDB...")
	repo := repositories.NewCharactersRepository()
	characters, err := repo.GetAll()
	if err != nil {
		// handle error
	}

	// factory := warhammer.CharacterSheetFactory{}
	// files, err := filepath.Glob("./*.json")
	// if err != nil {
	// 	return c.String(http.StatusInternalServerError, "Error scanning directory")
	// }
	return c.JSON(http.StatusOK, characters)
}

// @Summary Atak
// @Description Pobiera listę wszystkich postaci z plików JSON
// @Tags characters
// @Produce json
// @Success 200 {object} string "Lista postaci w formacie JSON"
// @Failure 500 {string} string "Error scanning directory"
// @Router /characters [get]
func handleFight(c echo.Context) error {
	request := new(requests.FightRequest)
	fmt.Println("request: ", request)
	// Bind the JSON request body to the struct
	if err := c.Bind(request); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid request format: " + err.Error(),
		})
	}
	// Log the received data
	fmt.Printf("Fight request received: %+v\n", request)

	fightService := fight.FightService{}
	response := fightService.Fight(*request)
	fmt.Printf("Fight response: %+v\n", response)

	return c.JSON(http.StatusOK, response)

}

func handleRoll(c echo.Context) error {
	request := new(requests.RollRequest)
	if err := c.Bind(request); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid request format: " + err.Error(),
		})
	}
	if request.Sides < 1 {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Sides must be greater than 0",
		})
	}
	rolls := roll.Dice{Sizes: request.Sides}
	result := rolls.Roll()
	return c.JSON(http.StatusOK, map[string]int{
		"result": result,
	})
}
