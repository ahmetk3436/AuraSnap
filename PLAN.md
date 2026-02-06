# Implementation Plan: Backend OpenAI Vision API Integration for Real Aura Analysis

## Overview

Replace mock random aura generation in `aura_service.go` with real OpenAI Vision API calls. Three files modified, zero new files created. No new Go dependencies required (uses `net/http` + `encoding/json` from stdlib).

---

## FILE 1: `backend/internal/config/config.go`

### Purpose
Add OpenAI API configuration fields so the aura service can authenticate with OpenAI.

### Exact Changes

**1a. Add two new fields to the `Config` struct (after line 22, after `RevenueCatWebhookAuth`)**

Add these two fields between `RevenueCatWebhookAuth string` and `Port string`:

```go
OpenAIAPIKey string
OpenAIModel  string
```

The struct will look like:
```go
type Config struct {
	DBHost     string
	DBPort     string
	DBUser     string
	DBPassword string
	DBName     string
	DBSSLMode  string

	JWTSecret        string
	JWTAccessExpiry  time.Duration
	JWTRefreshExpiry time.Duration

	RevenueCatWebhookAuth string

	OpenAIAPIKey string
	OpenAIModel  string

	Port        string
	CORSOrigins string
}
```

**1b. Add two new lines inside the `Load()` function return statement (after line 39, after `RevenueCatWebhookAuth`)**

Add these two lines after the `RevenueCatWebhookAuth: getEnv(...)` line and before the `Port: getEnv(...)` line:

```go
OpenAIAPIKey: getEnv("OPENAI_API_KEY", ""),
OpenAIModel:  getEnv("OPENAI_MODEL", "gpt-4o-mini"),
```

### No other changes to this file. No new imports needed.

---

## FILE 2: `backend/internal/services/aura_service.go`

### Purpose
Rewrite the `Create()` method to call OpenAI Vision API. Keep all other methods unchanged.

### IMPORTS — Replace the entire import block (lines 3-12)

Replace:
```go
import (
	"errors"
	"math/rand"
	"time"

	"github.com/ahmetcoskunkizilkaya/aurasnap/backend/internal/dto"
	"github.com/ahmetcoskunkizilkaya/aurasnap/backend/internal/models"
	"github.com/google/uuid"
	"gorm.io/gorm"
)
```

With:
```go
import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math/rand"
	"net/http"
	"strings"
	"time"

	"github.com/ahmetcoskunkizilkaya/aurasnap/backend/internal/config"
	"github.com/ahmetcoskunkizilkaya/aurasnap/backend/internal/dto"
	"github.com/ahmetcoskunkizilkaya/aurasnap/backend/internal/models"
	"github.com/google/uuid"
	"gorm.io/gorm"
)
```

### STRUCT — Replace the `AuraService` struct and `NewAuraService` (lines 14-20)

Replace:
```go
type AuraService struct {
	db *gorm.DB
}

func NewAuraService(db *gorm.DB) *AuraService {
	return &AuraService{db: db}
}
```

With:
```go
type AuraService struct {
	db  *gorm.DB
	cfg *config.Config
}

func NewAuraService(db *gorm.DB, cfg *config.Config) *AuraService {
	if cfg.OpenAIAPIKey == "" {
		log.Println("WARNING: OPENAI_API_KEY is not set. Aura analysis will use mock fallback data.")
	}
	return &AuraService{db: db, cfg: cfg}
}
```

### KEEP the existing `colorTraits` map (lines 22-88) and `secondaryColors` slice (line 90) EXACTLY as they are. No changes.

### ADD — OpenAI request/response types (insert AFTER `var secondaryColors` on line 90, BEFORE the `Create` function)

Insert these type definitions:

```go
// openAIRequest represents the request body for the OpenAI Chat Completions API.
type openAIRequest struct {
	Model          string            `json:"model"`
	Messages       []openAIMessage   `json:"messages"`
	ResponseFormat openAIRespFormat  `json:"response_format"`
	MaxTokens      int               `json:"max_tokens"`
}

type openAIMessage struct {
	Role    string      `json:"role"`
	Content interface{} `json:"content"`
}

type openAIRespFormat struct {
	Type string `json:"type"`
}

type openAIContentPart struct {
	Type     string            `json:"type"`
	Text     string            `json:"text,omitempty"`
	ImageURL *openAIImageURL   `json:"image_url,omitempty"`
}

type openAIImageURL struct {
	URL    string `json:"url"`
	Detail string `json:"detail"`
}

type openAIResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
		Type    string `json:"type"`
	} `json:"error"`
}

// auraAIResult represents the structured JSON returned by GPT for aura analysis.
type auraAIResult struct {
	AuraColor      string   `json:"aura_color"`
	SecondaryColor *string  `json:"secondary_color"`
	EnergyLevel    int      `json:"energy_level"`
	MoodScore      int      `json:"mood_score"`
	Personality    string   `json:"personality"`
	Strengths      []string `json:"strengths"`
	Challenges     []string `json:"challenges"`
	DailyAdvice    string   `json:"daily_advice"`
}
```

### ADD — The `auraSystemPrompt` constant (insert right after the type definitions above)

```go
const auraSystemPrompt = `You are an aura reader AI. Analyze the person's photo and determine their aura energy.
Return ONLY a valid JSON object with these exact fields:
- "aura_color": one of "red", "orange", "yellow", "green", "blue", "indigo", "violet", "white", "gold", "pink"
- "secondary_color": one of "silver", "gold", "white", "black", "grey", or null if no secondary aura detected
- "energy_level": integer between 40 and 95, based on perceived vitality, posture, and brightness
- "mood_score": integer between 5 and 10, based on facial expression and overall vibe
- "personality": 2-3 sentence personality description based on the detected aura
- "strengths": array of exactly 3 strings describing the person's strengths
- "challenges": array of exactly 3 strings describing growth areas
- "daily_advice": 1-2 sentence personalized advice for today

Base your analysis on facial expression, body language, lighting, colors in the image, and overall energy.
Do NOT include any text outside the JSON object.`
```

### REPLACE — The entire `Create` method (lines 92-126)

Replace the current `Create` function with:

```go
func (s *AuraService) Create(userID uuid.UUID, req dto.CreateAuraRequest) (*models.AuraReading, error) {
	var reading *models.AuraReading

	// If OpenAI API key is configured, use real AI analysis
	if s.cfg.OpenAIAPIKey != "" {
		result, err := s.callOpenAIVision(req.ImageURL)
		if err != nil {
			log.Printf("OpenAI Vision API error, falling back to mock: %v", err)
			reading = s.generateMockReading(userID, req.ImageURL)
		} else {
			reading = s.buildReadingFromAI(userID, req.ImageURL, result)
		}
	} else {
		// FALLBACK: No API key configured, use mock generation
		reading = s.generateMockReading(userID, req.ImageURL)
	}

	if err := s.db.Create(reading).Error; err != nil {
		return nil, err
	}

	return reading, nil
}
```

### ADD — The `callOpenAIVision` method (insert after the new `Create` method)

```go
func (s *AuraService) callOpenAIVision(imageURL string) (*auraAIResult, error) {
	reqBody := openAIRequest{
		Model: s.cfg.OpenAIModel,
		Messages: []openAIMessage{
			{
				Role:    "system",
				Content: auraSystemPrompt,
			},
			{
				Role: "user",
				Content: []openAIContentPart{
					{
						Type: "text",
						Text: "Analyze this person's aura from their photo.",
					},
					{
						Type: "image_url",
						ImageURL: &openAIImageURL{
							URL:    imageURL,
							Detail: "low",
						},
					},
				},
			},
		},
		ResponseFormat: openAIRespFormat{Type: "json_object"},
		MaxTokens:      500,
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	// Try up to 2 times (initial + 1 retry on 429)
	var lastErr error
	for attempt := 0; attempt < 2; attempt++ {
		result, statusCode, err := s.doOpenAIRequest(jsonBody)
		if err == nil {
			return result, nil
		}
		lastErr = err

		// Only retry on 429 (rate limit)
		if statusCode != http.StatusTooManyRequests {
			break
		}
		log.Printf("OpenAI rate limited (attempt %d/2), retrying in 2s...", attempt+1)
		time.Sleep(2 * time.Second)
	}

	return nil, lastErr
}
```

### ADD — The `doOpenAIRequest` method (insert after `callOpenAIVision`)

```go
func (s *AuraService) doOpenAIRequest(jsonBody []byte) (*auraAIResult, int, error) {
	httpReq, err := http.NewRequest("POST", "https://api.openai.com/v1/chat/completions", bytes.NewReader(jsonBody))
	if err != nil {
		return nil, 0, fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+s.cfg.OpenAIAPIKey)

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, 0, fmt.Errorf("OpenAI API request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, fmt.Errorf("failed to read response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, resp.StatusCode, fmt.Errorf("OpenAI API returned status %d: %s", resp.StatusCode, string(body))
	}

	var openAIResp openAIResponse
	if err := json.Unmarshal(body, &openAIResp); err != nil {
		return nil, resp.StatusCode, fmt.Errorf("failed to parse OpenAI response: %w", err)
	}

	if openAIResp.Error != nil {
		return nil, resp.StatusCode, fmt.Errorf("OpenAI API error: %s", openAIResp.Error.Message)
	}

	if len(openAIResp.Choices) == 0 {
		return nil, resp.StatusCode, fmt.Errorf("OpenAI returned no choices")
	}

	content := strings.TrimSpace(openAIResp.Choices[0].Message.Content)

	var result auraAIResult
	if err := json.Unmarshal([]byte(content), &result); err != nil {
		return nil, resp.StatusCode, fmt.Errorf("failed to parse aura JSON from GPT: %w", err)
	}

	// Validate and clamp fields to DB constraints
	result.EnergyLevel = clampInt(result.EnergyLevel, 1, 100)
	result.MoodScore = clampInt(result.MoodScore, 1, 10)

	validColors := map[string]bool{
		"red": true, "orange": true, "yellow": true, "green": true, "blue": true,
		"indigo": true, "violet": true, "white": true, "gold": true, "pink": true,
	}
	if !validColors[result.AuraColor] {
		result.AuraColor = "blue" // safe default
	}

	if result.SecondaryColor != nil {
		validSecondary := map[string]bool{"silver": true, "gold": true, "white": true, "black": true, "grey": true}
		if !validSecondary[*result.SecondaryColor] {
			result.SecondaryColor = nil
		}
	}

	if len(result.Strengths) != 3 {
		if len(result.Strengths) > 3 {
			result.Strengths = result.Strengths[:3]
		}
		for len(result.Strengths) < 3 {
			result.Strengths = append(result.Strengths, "Inner Balance")
		}
	}

	if len(result.Challenges) != 3 {
		if len(result.Challenges) > 3 {
			result.Challenges = result.Challenges[:3]
		}
		for len(result.Challenges) < 3 {
			result.Challenges = append(result.Challenges, "Self-Discovery")
		}
	}

	if result.Personality == "" {
		result.Personality = "A unique and balanced individual with a vibrant aura."
	}

	if result.DailyAdvice == "" {
		result.DailyAdvice = "Take a moment to connect with your inner energy today."
	}

	return &result, resp.StatusCode, nil
}
```

### ADD — The `buildReadingFromAI` helper method (insert after `doOpenAIRequest`)

```go
func (s *AuraService) buildReadingFromAI(userID uuid.UUID, imageURL string, result *auraAIResult) *models.AuraReading {
	return &models.AuraReading{
		UserID:         userID,
		ImageURL:       imageURL,
		AuraColor:      result.AuraColor,
		SecondaryColor: result.SecondaryColor,
		EnergyLevel:    result.EnergyLevel,
		MoodScore:      result.MoodScore,
		Personality:    result.Personality,
		Strengths:      result.Strengths,
		Challenges:     result.Challenges,
		DailyAdvice:    result.DailyAdvice,
		AnalyzedAt:     time.Now(),
	}
}
```

### ADD — The `generateMockReading` helper method (insert after `buildReadingFromAI`)

This is the existing mock logic extracted into its own method:

```go
// generateMockReading creates an aura reading using random data.
// Used as a FALLBACK when OPENAI_API_KEY is not set or when the API call fails.
func (s *AuraService) generateMockReading(userID uuid.UUID, imageURL string) *models.AuraReading {
	colors := []string{"red", "orange", "yellow", "green", "blue", "indigo", "violet", "white", "gold", "pink"}
	selectedColor := colors[rand.Intn(len(colors))]
	traits := colorTraits[selectedColor]

	var secColor *string
	if rand.Intn(10) > 7 { // 30% chance of secondary color
		sc := secondaryColors[rand.Intn(len(secondaryColors))]
		secColor = &sc
	}

	energyLevel := rand.Intn(56) + 40 // 40-95
	moodScore := rand.Intn(6) + 5     // 5-10

	return &models.AuraReading{
		UserID:         userID,
		ImageURL:       imageURL,
		AuraColor:      selectedColor,
		SecondaryColor: secColor,
		EnergyLevel:    energyLevel,
		MoodScore:      moodScore,
		Personality:    traits.personality,
		Strengths:      traits.strengths,
		Challenges:     traits.challenges,
		DailyAdvice:    traits.dailyAdvice,
		AnalyzedAt:     time.Now(),
	}
}
```

### ADD — The `clampInt` utility function (insert after `generateMockReading`, before the existing `GetByID` method)

```go
func clampInt(value, min, max int) int {
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
}
```

### ALL existing methods after `Create` are UNCHANGED

The following methods remain exactly as-is — do NOT modify them:
- `GetByID` (line 128)
- `List` (line 137)
- `GetLatest` (line 160)
- `GetToday` (line 169)
- `Delete` (line 185)
- `GetStats` (line 196)

---

## FILE 3: `backend/cmd/server/main.go`

### Purpose
Pass the config to `NewAuraService` so it can access OpenAI credentials.

### Exact Change — One line modification (line 40)

Replace:
```go
auraService := services.NewAuraService(db)
```

With:
```go
auraService := services.NewAuraService(db, cfg)
```

### No other changes to this file. No new imports needed.

---

## COMPLETE FINAL FILE CONTENTS

### `backend/internal/services/aura_service.go` — Full file in order

The complete file structure from top to bottom:

1. `package services`
2. Import block (with `bytes`, `encoding/json`, `fmt`, `io`, `log`, `net/http`, `strings`, `config` package added)
3. `AuraService` struct (with `cfg *config.Config` field)
4. `NewAuraService(db, cfg)` constructor (with warning log if no API key)
5. `colorTraits` map — UNCHANGED
6. `secondaryColors` slice — UNCHANGED
7. OpenAI type definitions: `openAIRequest`, `openAIMessage`, `openAIRespFormat`, `openAIContentPart`, `openAIImageURL`, `openAIResponse`, `auraAIResult`
8. `auraSystemPrompt` constant
9. `Create()` method — NEW (dispatches to AI or mock)
10. `callOpenAIVision()` method — NEW (builds request, handles retry on 429)
11. `doOpenAIRequest()` method — NEW (HTTP call, parse, validate)
12. `buildReadingFromAI()` method — NEW (converts AI result to model)
13. `generateMockReading()` method — NEW (extracted from old Create, marked as FALLBACK)
14. `clampInt()` utility — NEW
15. `GetByID()` — UNCHANGED
16. `List()` — UNCHANGED
17. `GetLatest()` — UNCHANGED
18. `GetToday()` — UNCHANGED
19. `Delete()` — UNCHANGED
20. `GetStats()` — UNCHANGED

---

## VERIFICATION STEPS

1. **Build check**: `cd backend && go build ./...` — must compile with zero errors
2. **No new dependencies**: All imports are stdlib (`net/http`, `encoding/json`, `bytes`, `io`, `fmt`, `strings`) plus the existing `config` package
3. **Backward compatible**: `go.mod` and `go.sum` need no changes
4. **Env var behavior**:
   - `OPENAI_API_KEY=""` (empty/unset) → logs warning at startup, uses mock fallback for all scans
   - `OPENAI_API_KEY="sk-..."` (valid) → calls OpenAI Vision API, falls back to mock on any error
   - `OPENAI_MODEL=""` (empty/unset) → defaults to `"gpt-4o-mini"`
   - `OPENAI_MODEL="gpt-4o"` → uses specified model

---

## WHAT NOT TO CHANGE

- `backend/internal/models/aura_reading.go` — no changes needed
- `backend/internal/dto/aura.go` — no changes needed
- `backend/internal/handlers/aura_handler.go` — no changes needed (it calls `auraService.Create()` which keeps the same signature)
- `backend/go.mod` / `backend/go.sum` — no changes needed (no new external packages)
- All other handler/service/middleware files — untouched
