package handlers

import (
	"crypto/subtle"
	"strings"

	"github.com/ahmetcoskunkizilkaya/aurasnap/backend/internal/config"
	"github.com/ahmetcoskunkizilkaya/aurasnap/backend/internal/dto"
	"github.com/ahmetcoskunkizilkaya/aurasnap/backend/internal/services"
	"github.com/gofiber/fiber/v2"
)

type WebhookHandler struct {
	subscriptionService *services.SubscriptionService
	cfg                 *config.Config
}

func NewWebhookHandler(subscriptionService *services.SubscriptionService, cfg *config.Config) *WebhookHandler {
	return &WebhookHandler{
		subscriptionService: subscriptionService,
		cfg:                 cfg,
	}
}

func (h *WebhookHandler) HandleRevenueCat(c *fiber.Ctx) error {
	// Verify authorization header using constant-time comparison
	expected := strings.TrimSpace(h.cfg.RevenueCatWebhookAuth)
	if expected == "" {
		return c.Status(fiber.StatusServiceUnavailable).JSON(dto.ErrorResponse{
			Error:   true,
			Message: "Webhook auth not configured",
		})
	}

	authHeader := c.Get("Authorization")
	if subtle.ConstantTimeCompare([]byte(authHeader), []byte(expected)) != 1 {
		return c.Status(fiber.StatusUnauthorized).JSON(dto.ErrorResponse{
			Error:   true,
			Message: "Unauthorized",
		})
	}

	var webhook dto.RevenueCatWebhook
	if err := c.BodyParser(&webhook); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(dto.ErrorResponse{
			Error:   true,
			Message: "Invalid webhook payload",
		})
	}

	if err := h.subscriptionService.HandleWebhookEvent(&webhook.Event); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(dto.ErrorResponse{
			Error:   true,
			Message: "Failed to process webhook event",
		})
	}

	return c.JSON(fiber.Map{"received": true})
}
