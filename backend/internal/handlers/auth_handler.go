package handlers

import (
	"errors"

	"github.com/ahmetcoskunkizilkaya/aurasnap/backend/internal/dto"
	"github.com/ahmetcoskunkizilkaya/aurasnap/backend/internal/services"
	"github.com/gofiber/fiber/v2"
)

// AuthHandler handles authentication requests
type AuthHandler struct {
	authService *services.AuthService
}

// NewAuthHandler creates a new AuthHandler instance
func NewAuthHandler(authService *services.AuthService) *AuthHandler {
	return &AuthHandler{authService: authService}
}

// Register handles new user registration
func (h *AuthHandler) Register(c *fiber.Ctx) error {
	var req dto.RegisterRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(dto.ErrorResponse{Error: true, Message: "Invalid request body"})
	}

	resp, err := h.authService.Register(&req)
	if err != nil {
		if errors.Is(err, services.ErrEmailTaken) {
			return c.Status(fiber.StatusConflict).JSON(dto.ErrorResponse{Error: true, Message: err.Error()})
		}
		return c.Status(fiber.StatusBadRequest).JSON(dto.ErrorResponse{Error: true, Message: err.Error()})
	}

	return c.Status(fiber.StatusCreated).JSON(resp)
}

// Login handles user login
func (h *AuthHandler) Login(c *fiber.Ctx) error {
	var req dto.LoginRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(dto.ErrorResponse{Error: true, Message: "Invalid request body"})
	}

	resp, err := h.authService.Login(&req)
	if err != nil {
		if errors.Is(err, services.ErrInvalidCredentials) {
			return c.Status(fiber.StatusUnauthorized).JSON(dto.ErrorResponse{Error: true, Message: err.Error()})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(dto.ErrorResponse{Error: true, Message: "Login failed"})
	}

	return c.JSON(resp)
}

// ClaimGuest upgrades an authenticated anonymous guest account into a real account.
func (h *AuthHandler) ClaimGuest(c *fiber.Ctx) error {
	userID, err := extractUserID(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(dto.ErrorResponse{Error: true, Message: "Unauthorized"})
	}

	var req dto.ClaimGuestRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(dto.ErrorResponse{Error: true, Message: "Invalid request body"})
	}

	resp, err := h.authService.ClaimGuest(userID, &req)
	if err != nil {
		if errors.Is(err, services.ErrEmailTaken) {
			return c.Status(fiber.StatusConflict).JSON(dto.ErrorResponse{Error: true, Message: err.Error()})
		}
		if errors.Is(err, services.ErrGuestOnlyAction) {
			return c.Status(fiber.StatusBadRequest).JSON(dto.ErrorResponse{Error: true, Message: err.Error()})
		}
		if errors.Is(err, services.ErrUserNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(dto.ErrorResponse{Error: true, Message: "User not found"})
		}
		return c.Status(fiber.StatusBadRequest).JSON(dto.ErrorResponse{Error: true, Message: err.Error()})
	}

	return c.JSON(resp)
}

// RefreshToken handles JWT refresh
func (h *AuthHandler) RefreshToken(c *fiber.Ctx) error {
	var req dto.RefreshRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(dto.ErrorResponse{Error: true, Message: "Invalid request body"})
	}

	resp, err := h.authService.Refresh(&req)
	if err != nil {
		if errors.Is(err, services.ErrInvalidToken) {
			return c.Status(fiber.StatusUnauthorized).JSON(dto.ErrorResponse{Error: true, Message: err.Error()})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(dto.ErrorResponse{Error: true, Message: "Token refresh failed"})
	}

	return c.JSON(resp)
}

// Logout handles user logout
func (h *AuthHandler) Logout(c *fiber.Ctx) error {
	var req dto.LogoutRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(dto.ErrorResponse{Error: true, Message: "Invalid request body"})
	}

	if err := h.authService.Logout(&req); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(dto.ErrorResponse{Error: true, Message: "Logout failed"})
	}

	return c.JSON(fiber.Map{"message": "Logged out successfully"})
}

// DeleteAccount implements Apple Guideline 5.1.1
func (h *AuthHandler) DeleteAccount(c *fiber.Ctx) error {
	userID, err := extractUserID(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(dto.ErrorResponse{Error: true, Message: "Unauthorized"})
	}

	var body struct {
		Password string `json:"password"`
	}
	c.BodyParser(&body)

	if err := h.authService.DeleteAccount(userID, body.Password); err != nil {
		if errors.Is(err, services.ErrInvalidCredentials) {
			return c.Status(fiber.StatusUnauthorized).JSON(dto.ErrorResponse{Error: true, Message: "Invalid password"})
		}
		if errors.Is(err, services.ErrUserNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(dto.ErrorResponse{Error: true, Message: "User not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(dto.ErrorResponse{Error: true, Message: "Failed to delete account"})
	}

	return c.JSON(fiber.Map{"message": "Account deleted successfully"})
}

// AppleSignIn handles Sign in with Apple (Guideline 4.8)
func (h *AuthHandler) AppleSignIn(c *fiber.Ctx) error {
	var req dto.AppleSignInRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(dto.ErrorResponse{Error: true, Message: "Invalid request body"})
	}

	resp, err := h.authService.AppleSignIn(&req)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(dto.ErrorResponse{Error: true, Message: err.Error()})
	}

	return c.JSON(resp)
}

// GetProfile retrieves the user's profile information
func (h *AuthHandler) GetProfile(c *fiber.Ctx) error {
	userID, err := extractUserID(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(dto.ErrorResponse{Error: true, Message: "Unauthorized"})
	}

	profile, err := h.authService.GetProfile(userID)
	if err != nil {
		if errors.Is(err, services.ErrUserNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(dto.ErrorResponse{Error: true, Message: "User not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(dto.ErrorResponse{Error: true, Message: "Failed to fetch profile"})
	}

	return c.JSON(profile)
}
