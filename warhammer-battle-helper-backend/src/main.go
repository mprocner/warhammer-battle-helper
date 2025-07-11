package main

import (
	_ "battle-helper/docs"
	"battle-helper/warhammer"
	echoSwagger "github.com/swaggo/echo-swagger"
	"net/http"
	"os"
	"path/filepath"

	"github.com/labstack/echo/v4"
)

// @title Battle Helper API
// @version 1.0
// @description API do obsługi systemu Battle Helper
// @host localhost:80801
// @BasePath /
func main() {
	e := echo.New()

	e.GET("/", handleHome)
	e.GET("/health", handleHealth)
	e.GET("/characters", handleCharacters)

	e.GET("/swagger/*", echoSwagger.WrapHandler)

	httpPort := os.Getenv("PORT")
	if httpPort == "" {
		httpPort = "8080"
	}

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
	//var attaker, defender warhammer.Sheet
	//factory := warhammer.CharacterSheetFactory{}
	//
	//attaker = factory.Prepare("./WalterCharacterSheet.json")
	//defender = factory.Prepare("./LudgerCharacterSheet.json")

	//dice := roll.Dice{Sizes: 100}
	//
	//dice.Fight(attaker, defender)

	factory := warhammer.CharacterSheetFactory{}
	files, err := filepath.Glob("./*.json")
	if err != nil {
		return c.String(http.StatusInternalServerError, "Error scanning directory")
	}
	return c.String(http.StatusOK, factory.List(files))
}
