package routes

import (
	"github.com/ahmetcoskunkizilkaya/aurasnap/backend/internal/config"
	"github.com/ahmetcoskunkizilkaya/aurasnap/backend/internal/handlers"
	"github.com/ahmetcoskunkizilkaya/aurasnap/backend/internal/middleware"
	"github.com/gofiber/fiber/v2"
)

// Setup configures all API routes for the application
func Setup(app *fiber.App, cfg *config.Config, authHandler *handlers.AuthHandler, healthHandler *handlers.HealthHandler, webhookHandler *handlers.WebhookHandler, moderationHandler *handlers.ModerationHandler, auraHandler *handlers.AuraHandler, auraMatchHandler *handlers.AuraMatchHandler, streakHandler *handlers.StreakHandler, legalHandler *handlers.LegalHandler) {
	api := app.Group("/api")

	// Health check
	api.Get("/health", healthHandler.Check)

	// Legal pages
	api.Get("/privacy-policy", legalHandler.PrivacyPolicy)
	api.Get("/terms", legalHandler.TermsOfService)

	// Public auth routes
	auth := api.Group("/auth")
	auth.Post("/register", authHandler.Register)
	auth.Post("/login", authHandler.Login)
	auth.Post("/refresh", authHandler.RefreshToken)
	auth.Post("/apple", authHandler.AppleSignIn)

	// Webhooks (public but auth-header verified)
	api.Post("/webhooks/revenuecat", webhookHandler.HandleRevenueCat)

	// Protected routes (require JWT)
	protected := api.Group("", middleware.JWTProtected(cfg))

	// Auth (protected)
	protected.Post("/auth/logout", authHandler.Logout)
	protected.Delete("/auth/account", authHandler.DeleteAccount)
	protected.Get("/auth/profile", authHandler.GetProfile)

	// Aura routes
	aura := protected.Group("/aura")
	aura.Get("/scan/check", auraHandler.CheckScanEligibility)
	aura.Post("/scan", auraHandler.Scan)
	aura.Post("/scan/upload", auraHandler.ScanWithUpload)
	aura.Get("/stats", auraHandler.Stats)
	aura.Get("/:id", auraHandler.GetByID)
	aura.Get("", auraHandler.List)

	// Aura Match routes
	match := protected.Group("/match")
	match.Post("", auraMatchHandler.CreateMatch)
	match.Get("", auraMatchHandler.GetMatches)
	match.Get("/:friend_id", auraMatchHandler.GetMatchByFriend)

	// Streak routes
	streak := protected.Group("/streak")
	streak.Get("", streakHandler.GetStreak)
	streak.Post("/update", streakHandler.UpdateStreak)

	// Moderation routes
	protected.Post("/reports", moderationHandler.CreateReport)
	protected.Post("/blocks", moderationHandler.BlockUser)
	protected.Delete("/blocks/:id", moderationHandler.UnblockUser)

	// Admin routes
	admin := protected.Group("/admin", middleware.AdminOnly(cfg))
	admin.Get("/moderation/reports", moderationHandler.ListReports)
	admin.Put("/moderation/reports/:id", moderationHandler.ActionReport)
}
