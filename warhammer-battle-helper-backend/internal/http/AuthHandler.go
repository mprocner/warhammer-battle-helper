package http

import (
	"battle-helper/internal/config/helpers"
	"battle-helper/internal/email"
	"battle-helper/internal/models"
	"battle-helper/internal/repository"
	"crypto/rand"
	"encoding/hex"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"golang.org/x/crypto/bcrypt"
	"net/http"
	"time"
)

type AuthHandler struct {
	UserRepo     *repository.UserRepository
	EmailService *email.EmailService
}

type RegisterRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=8"`
}

type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

func generateJWT(userID string, email string) (string, error) {
	claims := jwt.MapClaims{
		"user_id": userID,
		"email":   email,
		"exp":     time.Now().Add(24 * time.Hour).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	return token.SignedString(helpers.PrivateKey)
}

func generateSecureToken() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

func (h *AuthHandler) Register(c *gin.Context) {
	var req RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	existing, _ := h.UserRepo.FindByEmail(req.Email)
	if existing != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "User already exists"})
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Hashing error"})
		return
	}
	token, err := generateSecureToken()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Token generation error"})
		return
	}
	user := &models.User{
		Email:           req.Email,
		Password:        string(hash),
		Active:          false,
		ActivationToken: token,
	}
	if err := h.UserRepo.Create(user); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "DB error"})
		return
	}
	if err := h.EmailService.SendActivationEmail(req.Email, token); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not send confirmation email"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"message": "Registration successful. Please check your email to activate your account."})
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	user, err := h.UserRepo.FindByEmail(req.Email)
	if err != nil || user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
		return
	}
	// Legacy users (created before email verification) have no activationToken — allow login
	if !user.Active && user.ActivationToken != "" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Please confirm your email address before logging in"})
		return
	}
	token, err := generateJWT(user.ID.Hex(), user.Email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Token generation error"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"token": token})
}

func (h *AuthHandler) ForgotPassword(c *gin.Context) {
	var req struct {
		Email string `json:"email" binding:"required,email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Always return 200 — prevents user enumeration
	successMsg := gin.H{"message": "If this email is registered, you will receive a reset link."}

	user, err := h.UserRepo.FindByEmail(req.Email)
	if err != nil || user == nil || !user.Active {
		c.JSON(http.StatusOK, successMsg)
		return
	}

	token, err := generateSecureToken()
	if err != nil {
		c.JSON(http.StatusOK, successMsg)
		return
	}

	expiry := time.Now().Add(1 * time.Hour)
	if err := h.UserRepo.SetResetToken(user.ID, token, expiry); err != nil {
		c.JSON(http.StatusOK, successMsg)
		return
	}

	_ = h.EmailService.SendPasswordResetEmail(req.Email, token)
	c.JSON(http.StatusOK, successMsg)
}

func (h *AuthHandler) ResetPassword(c *gin.Context) {
	var req struct {
		Token    string `json:"token" binding:"required"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if len(req.Password) < 8 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Password must be at least 8 characters."})
		return
	}

	user, err := h.UserRepo.FindByResetToken(req.Token)
	if err != nil || user == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid or expired token."})
		return
	}

	if time.Now().After(user.ResetTokenExpiry) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid or expired token."})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Hashing error"})
		return
	}

	if err := h.UserRepo.UpdatePasswordAndClearToken(user.ID, string(hash)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "DB error"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Password updated successfully."})
}

func (h *AuthHandler) ChangePassword(c *gin.Context) {
	var req struct {
		CurrentPassword string `json:"currentPassword" binding:"required"`
		NewPassword     string `json:"newPassword" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if len(req.NewPassword) < 8 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Password must be at least 8 characters."})
		return
	}

	token, _ := c.Get("jwt")
	claims, ok := token.(*jwt.Token).Claims.(jwt.MapClaims)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid token claims"})
		return
	}
	userIDStr := claims["user_id"].(string)
	userID, err := primitive.ObjectIDFromHex(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	user, err := h.UserRepo.FindByID(userID)
	if err != nil || user == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "User not found"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.CurrentPassword)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid current password"})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Hashing error"})
		return
	}

	if err := h.UserRepo.UpdatePassword(userID, string(hash)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "DB error"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Password changed successfully"})
}

func (h *AuthHandler) VerifyEmail(c *gin.Context) {
	token := c.Query("token")
	if token == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing token"})
		return
	}
	user, err := h.UserRepo.FindByActivationToken(token)
	if err != nil || user == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid or expired token"})
		return
	}
	if err := h.UserRepo.ActivateUser(user.ID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Activation failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Account activated successfully"})
}
