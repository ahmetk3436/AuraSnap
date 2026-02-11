package middleware

import (
	"crypto/subtle"
	"strings"

	"github.com/ahmetcoskunkizilkaya/aurasnap/backend/internal/config"
	"github.com/ahmetcoskunkizilkaya/aurasnap/backend/internal/dto"
	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
)

// AdminOnly restricts access to explicitly configured admin identities.
//
// Supported mechanisms:
// - JWT claim match: `email` in ADMIN_EMAILS (comma-separated), or `sub` in ADMIN_USER_IDS (comma-separated UUIDs).
// - Optional header token: `X-Admin-Token` equals ADMIN_TOKEN (constant-time compare).
func AdminOnly(cfg *config.Config) fiber.Handler {
	emailAllow := make(map[string]struct{})
	for _, e := range strings.Split(cfg.AdminEmails, ",") {
		e = strings.ToLower(strings.TrimSpace(e))
		if e != "" {
			emailAllow[e] = struct{}{}
		}
	}

	idAllow := make(map[string]struct{})
	for _, id := range strings.Split(cfg.AdminUserIDs, ",") {
		id = strings.TrimSpace(id)
		if id != "" {
			idAllow[id] = struct{}{}
		}
	}

	adminToken := strings.TrimSpace(cfg.AdminToken)

	return func(c *fiber.Ctx) error {
		if adminToken != "" {
			if subtle.ConstantTimeCompare([]byte(strings.TrimSpace(c.Get("X-Admin-Token"))), []byte(adminToken)) == 1 {
				return c.Next()
			}
		}

		token, ok := c.Locals("user").(*jwt.Token)
		if !ok {
			return c.Status(fiber.StatusForbidden).JSON(dto.ErrorResponse{Error: true, Message: "Forbidden"})
		}
		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			return c.Status(fiber.StatusForbidden).JSON(dto.ErrorResponse{Error: true, Message: "Forbidden"})
		}

		email, _ := claims["email"].(string)
		if email != "" {
			if _, ok := emailAllow[strings.ToLower(email)]; ok {
				return c.Next()
			}
		}

		sub, _ := claims["sub"].(string)
		if sub != "" {
			if _, ok := idAllow[sub]; ok {
				return c.Next()
			}
		}

		return c.Status(fiber.StatusForbidden).JSON(dto.ErrorResponse{Error: true, Message: "Forbidden"})
	}
}
