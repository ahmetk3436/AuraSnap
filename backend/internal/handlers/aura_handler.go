package handlers

import (
	"encoding/base64"
	"io"
	"strconv"
	"strings"

	"github.com/ahmetcoskunkizilkaya/aurasnap/backend/internal/dto"
	"github.com/ahmetcoskunkizilkaya/aurasnap/backend/internal/services"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

// AuraHandler handles HTTP requests related to Aura scanning
type AuraHandler struct {
	auraService *services.AuraService
}

// NewAuraHandler creates a new AuraHandler instance
func NewAuraHandler(auraService *services.AuraService) *AuraHandler {
	return &AuraHandler{auraService: auraService}
}

// CheckScanEligibility checks if the user can perform a scan
func (h *AuraHandler) CheckScanEligibility(c *fiber.Ctx) error {
	userIDStr := c.Locals("userID").(string)
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid user ID"})
	}

	isSubscribed := h.auraService.IsSubscribed(userID)

	allowed, remaining, err := h.auraService.CanScan(userID, isSubscribed)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to check eligibility"})
	}

	return c.JSON(dto.ScanEligibilityResponse{
		CanScan:      allowed,
		Remaining:    remaining,
		IsSubscribed: isSubscribed,
	})
}

// Scan handles the aura scan request with JSON body (base64 or URL)
func (h *AuraHandler) Scan(c *fiber.Ctx) error {
	userIDStr := c.Locals("userID").(string)
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid user ID"})
	}

	// Rate limit check
	isSubscribed := h.auraService.IsSubscribed(userID)
	allowed, _, err := h.auraService.CanScan(userID, isSubscribed)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to verify scan eligibility"})
	}
	if !allowed {
		return c.Status(429).JSON(fiber.Map{"error": "Daily scan limit reached. Upgrade to Premium for unlimited scans."})
	}

	// Parse request
	var req dto.CreateAuraRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	// Validate base64 size (max ~3MB base64 = ~2.25MB image)
	if req.ImageData != "" && len(req.ImageData) > 3*1024*1024 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Image data too large. Maximum 3MB base64."})
	}

	if req.ImageData == "" && req.ImageURL == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Either image_data or image_url is required"})
	}

	// Create aura reading
	reading, err := h.auraService.Create(userID, req)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.Status(fiber.StatusCreated).JSON(reading)
}

// ScanWithUpload handles multipart form upload for aura scan
func (h *AuraHandler) ScanWithUpload(c *fiber.Ctx) error {
	userIDStr := c.Locals("userID").(string)
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid user ID"})
	}

	// Rate limit check
	isSubscribed := h.auraService.IsSubscribed(userID)
	allowed, _, err := h.auraService.CanScan(userID, isSubscribed)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to verify scan eligibility"})
	}
	if !allowed {
		return c.Status(429).JSON(fiber.Map{"error": "Daily scan limit reached. Upgrade to Premium for unlimited scans."})
	}

	// Get file from form
	file, err := c.FormFile("image")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Image file is required"})
	}

	// Validate file type
	contentType := file.Header.Get("Content-Type")
	if !strings.HasPrefix(contentType, "image/jpeg") && !strings.HasPrefix(contentType, "image/png") {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Only JPEG and PNG images are supported"})
	}

	// Validate file size (4MB max)
	if file.Size > 4*1024*1024 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Image too large. Maximum 4MB."})
	}

	// Read file content
	f, err := file.Open()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to read image"})
	}
	defer f.Close()

	fileBytes, err := io.ReadAll(f)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to read image data"})
	}

	// Encode to base64
	b64Data := base64.StdEncoding.EncodeToString(fileBytes)

	req := dto.CreateAuraRequest{
		ImageData: b64Data,
	}

	reading, err := h.auraService.Create(userID, req)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.Status(fiber.StatusCreated).JSON(reading)
}

// GetByID retrieves a single aura reading
func (h *AuraHandler) GetByID(c *fiber.Ctx) error {
	userIDStr := c.Locals("userID").(string)
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid user ID"})
	}

	readingID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid reading ID"})
	}

	reading, err := h.auraService.GetByID(userID, readingID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Reading not found"})
	}

	return c.JSON(reading)
}

// List returns paginated aura readings for the user
func (h *AuraHandler) List(c *fiber.Ctx) error {
	userIDStr := c.Locals("userID").(string)
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid user ID"})
	}

	page, _ := strconv.Atoi(c.Query("page", "1"))
	pageSize, _ := strconv.Atoi(c.Query("page_size", "20"))

	readings, total, err := h.auraService.List(userID, page, pageSize)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch readings"})
	}

	items := make([]dto.AuraReadingResponse, 0, len(readings))
	for _, r := range readings {
		items = append(items, dto.AuraReadingResponse{
			ID:             r.ID,
			UserID:         r.UserID,
			AuraColor:      r.AuraColor,
			SecondaryColor: r.SecondaryColor,
			EnergyLevel:    r.EnergyLevel,
			MoodScore:      r.MoodScore,
			Personality:    r.Personality,
			Strengths:      r.Strengths,
			Challenges:     r.Challenges,
			DailyAdvice:    r.DailyAdvice,
			ImageURL:       r.ImageURL,
			AnalyzedAt:     r.AnalyzedAt,
			CreatedAt:      r.CreatedAt,
		})
	}

	return c.JSON(dto.AuraListResponse{
		Data:       items,
		Page:       page,
		PageSize:   pageSize,
		TotalCount: total,
	})
}

// Stats returns aggregated stats for the user's aura readings
func (h *AuraHandler) Stats(c *fiber.Ctx) error {
	userIDStr := c.Locals("userID").(string)
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid user ID"})
	}

	stats, err := h.auraService.GetStats(userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch stats"})
	}

	return c.JSON(stats)
}
