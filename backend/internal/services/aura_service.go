package services

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

type AuraService struct {
	db  *gorm.DB
	cfg *config.Config
}

func NewAuraService(db *gorm.DB, cfg *config.Config) *AuraService {
	if cfg.OpenAIAPIKey == "" {
		log.Println("WARNING: OPENAI_API_KEY is not set — aura analysis will use mock data")
	}
	return &AuraService{db: db, cfg: cfg}
}

// --- Fallback: colorTraits map used when OpenAI API is unavailable ---
var colorTraits = map[string]struct {
	personality string
	strengths   []string
	challenges  []string
	dailyAdvice string
}{
	"red": {
		personality: "Passionate, energetic, and action-oriented.",
		strengths:   []string{"Courage", "Leadership", "Determination"},
		challenges:  []string{"Impulsiveness", "Patience", "Anger Management"},
		dailyAdvice: "Channel your energy into a physical activity today. Avoid hasty decisions.",
	},
	"orange": {
		personality: "Creative, social, and adventurous.",
		strengths:   []string{"Creativity", "Optimism", "Social Skills"},
		challenges:  []string{"Scattered Focus", "Restlessness", "Overcommitment"},
		dailyAdvice: "Start a new creative project. Connect with an old friend.",
	},
	"yellow": {
		personality: "Optimistic, intellectual, and cheerful.",
		strengths:   []string{"Analytical Thinking", "Positivity", "Communication"},
		challenges:  []string{"Critical Nature", "Overthinking", "Perfectionism"},
		dailyAdvice: "Share your ideas with others. Take time to relax your mind.",
	},
	"green": {
		personality: "Balanced, growth-oriented, and nurturing.",
		strengths:   []string{"Compassion", "Reliability", "Growth Mindset"},
		challenges:  []string{"Jealousy", "Possessiveness", "Insecurity"},
		dailyAdvice: "Spend time in nature. Nurture a relationship or a plant.",
	},
	"blue": {
		personality: "Calm, intuitive, and trustworthy.",
		strengths:   []string{"Communication", "Intuition", "Loyalty"},
		challenges:  []string{"Fear of Expression", "Melancholy", "Stubbornness"},
		dailyAdvice: "Speak your truth today. Trust your gut feelings.",
	},
	"indigo": {
		personality: "Intuitive, wise, and deeply spiritual.",
		strengths:   []string{"Vision", "Wisdom", "Integrity"},
		challenges:  []string{"Isolation", "Judgment", "Rigidity"},
		dailyAdvice: "Meditate or reflect on your long-term goals. Practice forgiveness.",
	},
	"violet": {
		personality: "Visionary, artistic, and magical.",
		strengths:   []string{"Imagination", "Humanitarianism", "Leadership"},
		challenges:  []string{"Unrealistic Expectations", "Arrogance", "Detachment"},
		dailyAdvice: "Engage in art or music. Visualize your ideal future.",
	},
	"white": {
		personality: "Pure, balanced, and spiritually connected.",
		strengths:   []string{"Purity", "Healing", "High Vibration"},
		challenges:  []string{"Vulnerability", "Naivety", "Disconnection from Reality"},
		dailyAdvice: "Focus on cleansing your space, physical or mental. Protect your energy.",
	},
	"gold": {
		personality: "Confident, abundant, and empowered.",
		strengths:   []string{"Confidence", "Generosity", "Willpower"},
		challenges:  []string{"Ego", "Greed", "Overbearing nature"},
		dailyAdvice: "Share your abundance with others. Practice humility.",
	},
	"pink": {
		personality: "Loving, gentle, and compassionate.",
		strengths:   []string{"Love", "Empathy", "Nurturing"},
		challenges:  []string{"Neediness", "Martyrdom", "Lack of Boundaries"},
		dailyAdvice: "Practice self-love. Set healthy boundaries with kindness.",
	},
}

var secondaryColors = []string{"silver", "gold", "white", "black", "grey"}

// Allowed color sets for validation
var allowedPrimaryColors = map[string]bool{
	"red": true, "orange": true, "yellow": true, "green": true, "blue": true,
	"indigo": true, "violet": true, "white": true, "gold": true, "pink": true,
}

var allowedSecondaryColors = map[string]bool{
	"silver": true, "gold": true, "white": true, "black": true, "grey": true,
}

// OpenAI API request/response types
type openAIRequest struct {
	Model          string          `json:"model"`
	Messages       []openAIMessage `json:"messages"`
	MaxTokens      int             `json:"max_tokens"`
	Temperature    float64         `json:"temperature"`
	ResponseFormat *responseFormat  `json:"response_format,omitempty"`
}

type responseFormat struct {
	Type string `json:"type"`
}

type openAIMessage struct {
	Role    string      `json:"role"`
	Content interface{} `json:"content"`
}

type textContent struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type imageURLContent struct {
	Type     string         `json:"type"`
	ImageURL imageURLDetail `json:"image_url"`
}

type imageURLDetail struct {
	URL string `json:"url"`
}

type openAIResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

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

const openAISystemPrompt = `You are an aura reading AI. Analyze the person's photo and return a JSON object with the following fields:
- aura_color: one of red, orange, yellow, green, blue, indigo, violet, white, gold, pink
- secondary_color: one of silver, gold, white, black, grey OR null if no secondary aura detected
- energy_level: integer between 40 and 95 based on perceived vitality and energy in the photo
- mood_score: integer between 5 and 10 based on facial expression and emotional energy
- personality: 2-3 sentence personality description based on the aura reading
- strengths: array of exactly 3 strings representing key strengths
- challenges: array of exactly 3 strings representing growth areas
- daily_advice: 1-2 sentence personalized advice for today

Return ONLY valid JSON, no markdown or extra text.`

func (s *AuraService) Create(userID uuid.UUID, req dto.CreateAuraRequest) (*models.AuraReading, error) {
	// If no API key configured, use mock fallback
	if s.cfg.OpenAIAPIKey == "" {
		return s.createMockReading(userID, req)
	}

	// Attempt OpenAI Vision API call
	result, err := s.callOpenAIVision(req.ImageURL)
	if err != nil {
		log.Printf("OpenAI Vision API error, falling back to mock: %v", err)
		return s.createMockReading(userID, req)
	}

	// Validate and clamp the AI result
	s.validateAIResult(result)

	reading := &models.AuraReading{
		UserID:         userID,
		ImageURL:       req.ImageURL,
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

	if err := s.db.Create(reading).Error; err != nil {
		return nil, err
	}

	return reading, nil
}

func (s *AuraService) callOpenAIVision(imageURL string) (*auraAIResult, error) {
	reqBody := openAIRequest{
		Model: s.cfg.OpenAIModel,
		Messages: []openAIMessage{
			{
				Role:    "system",
				Content: openAISystemPrompt,
			},
			{
				Role: "user",
				Content: []interface{}{
					textContent{Type: "text", Text: "Analyze this person's aura from their photo."},
					imageURLContent{
						Type:     "image_url",
						ImageURL: imageURLDetail{URL: imageURL},
					},
				},
			},
		},
		MaxTokens:   500,
		Temperature: 0.7,
		ResponseFormat: &responseFormat{
			Type: "json_object",
		},
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	// Try up to 2 times (initial + 1 retry on 429)
	var lastErr error
	for attempt := 0; attempt < 2; attempt++ {
		if attempt > 0 {
			time.Sleep(2 * time.Second)
		}

		result, statusCode, err := s.doOpenAIRequest(bodyBytes)
		if err != nil {
			lastErr = err
			// Only retry on 429
			if statusCode == http.StatusTooManyRequests {
				log.Printf("OpenAI rate limited (429), retrying in 2s (attempt %d/2)", attempt+1)
				continue
			}
			return nil, err
		}
		return result, nil
	}

	return nil, fmt.Errorf("OpenAI API failed after retries: %w", lastErr)
}

func (s *AuraService) doOpenAIRequest(bodyBytes []byte) (*auraAIResult, int, error) {
	client := &http.Client{Timeout: 30 * time.Second}

	httpReq, err := http.NewRequest("POST", "https://api.openai.com/v1/chat/completions", bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, 0, fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+s.cfg.OpenAIAPIKey)

	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, 0, fmt.Errorf("HTTP request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, resp.StatusCode, fmt.Errorf("OpenAI API returned status %d: %s", resp.StatusCode, string(respBody))
	}

	var openAIResp openAIResponse
	if err := json.Unmarshal(respBody, &openAIResp); err != nil {
		return nil, resp.StatusCode, fmt.Errorf("failed to parse OpenAI response: %w", err)
	}

	if openAIResp.Error != nil {
		return nil, resp.StatusCode, fmt.Errorf("OpenAI API error: %s", openAIResp.Error.Message)
	}

	if len(openAIResp.Choices) == 0 {
		return nil, resp.StatusCode, fmt.Errorf("OpenAI returned no choices")
	}

	content := openAIResp.Choices[0].Message.Content

	var result auraAIResult
	if err := json.Unmarshal([]byte(content), &result); err != nil {
		return nil, resp.StatusCode, fmt.Errorf("failed to parse aura result JSON: %w", err)
	}

	return &result, resp.StatusCode, nil
}

func (s *AuraService) validateAIResult(result *auraAIResult) {
	// Validate primary color
	if !allowedPrimaryColors[strings.ToLower(result.AuraColor)] {
		result.AuraColor = "blue" // safe default
	}
	result.AuraColor = strings.ToLower(result.AuraColor)

	// Validate secondary color
	if result.SecondaryColor != nil {
		lower := strings.ToLower(*result.SecondaryColor)
		if !allowedSecondaryColors[lower] {
			result.SecondaryColor = nil
		} else {
			result.SecondaryColor = &lower
		}
	}

	// Clamp energy_level to 1-100 (DB constraint)
	if result.EnergyLevel < 1 {
		result.EnergyLevel = 1
	}
	if result.EnergyLevel > 100 {
		result.EnergyLevel = 100
	}

	// Clamp mood_score to 1-10 (DB constraint)
	if result.MoodScore < 1 {
		result.MoodScore = 1
	}
	if result.MoodScore > 10 {
		result.MoodScore = 10
	}

	// Ensure exactly 3 strengths
	if len(result.Strengths) < 3 {
		defaults := []string{"Resilience", "Adaptability", "Awareness"}
		for len(result.Strengths) < 3 {
			result.Strengths = append(result.Strengths, defaults[len(result.Strengths)])
		}
	} else if len(result.Strengths) > 3 {
		result.Strengths = result.Strengths[:3]
	}

	// Ensure exactly 3 challenges
	if len(result.Challenges) < 3 {
		defaults := []string{"Self-doubt", "Overthinking", "Boundaries"}
		for len(result.Challenges) < 3 {
			result.Challenges = append(result.Challenges, defaults[len(result.Challenges)])
		}
	} else if len(result.Challenges) > 3 {
		result.Challenges = result.Challenges[:3]
	}

	// Ensure personality is not empty
	if strings.TrimSpace(result.Personality) == "" {
		if traits, ok := colorTraits[result.AuraColor]; ok {
			result.Personality = traits.personality
		} else {
			result.Personality = "A balanced and thoughtful individual with a unique energy."
		}
	}

	// Ensure daily advice is not empty
	if strings.TrimSpace(result.DailyAdvice) == "" {
		if traits, ok := colorTraits[result.AuraColor]; ok {
			result.DailyAdvice = traits.dailyAdvice
		} else {
			result.DailyAdvice = "Take a moment to appreciate the present. Your energy is unique."
		}
	}
}

// createMockReading generates a mock aura reading using random data (fallback)
func (s *AuraService) createMockReading(userID uuid.UUID, req dto.CreateAuraRequest) (*models.AuraReading, error) {
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

	reading := &models.AuraReading{
		UserID:         userID,
		ImageURL:       req.ImageURL,
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

	if err := s.db.Create(reading).Error; err != nil {
		return nil, err
	}

	return reading, nil
}

func (s *AuraService) GetByID(userID, id uuid.UUID) (*models.AuraReading, error) {
	var reading models.AuraReading
	err := s.db.Where("user_id = ? AND id = ?", userID, id).First(&reading).Error
	if err != nil {
		return nil, err
	}
	return &reading, nil
}

func (s *AuraService) List(userID uuid.UUID, page, pageSize int) ([]models.AuraReading, int64, error) {
	var readings []models.AuraReading
	var total int64

	offset := (page - 1) * pageSize

	if err := s.db.Model(&models.AuraReading{}).Where("user_id = ?", userID).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	err := s.db.Where("user_id = ?", userID).
		Order("created_at DESC").
		Limit(pageSize).
		Offset(offset).
		Find(&readings).Error

	if err != nil {
		return nil, 0, err
	}

	return readings, total, nil
}

func (s *AuraService) GetLatest(userID uuid.UUID) (*models.AuraReading, error) {
	var reading models.AuraReading
	err := s.db.Where("user_id = ?", userID).Order("created_at DESC").First(&reading).Error
	if err != nil {
		return nil, err
	}
	return &reading, nil
}

func (s *AuraService) GetToday(userID uuid.UUID) (*models.AuraReading, error) {
	var reading models.AuraReading
	now := time.Now()
	startOfDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	endOfDay := startOfDay.Add(24 * time.Hour)

	err := s.db.Where("user_id = ? AND created_at >= ? AND created_at < ?", userID, startOfDay, endOfDay).
		Order("created_at DESC").
		First(&reading).Error

	if err != nil {
		return nil, err
	}
	return &reading, nil
}

func (s *AuraService) Delete(userID, id uuid.UUID) error {
	result := s.db.Where("user_id = ? AND id = ?", userID, id).Delete(&models.AuraReading{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return errors.New("record not found")
	}
	return nil
}

func (s *AuraService) GetStats(userID uuid.UUID) (*dto.AuraStatsResponse, error) {
	var readings []models.AuraReading
	if err := s.db.Where("user_id = ?", userID).Find(&readings).Error; err != nil {
		return nil, err
	}

	if len(readings) == 0 {
		return &dto.AuraStatsResponse{
			ColorDistribution: make(map[string]int),
			TotalReadings:     0,
			AverageEnergy:     0,
			AverageMood:       0,
		}, nil
	}

	colorDist := make(map[string]int)
	totalEnergy := 0
	totalMood := 0

	for _, r := range readings {
		colorDist[r.AuraColor]++
		totalEnergy += r.EnergyLevel
		totalMood += r.MoodScore
	}

	return &dto.AuraStatsResponse{
		ColorDistribution: colorDist,
		TotalReadings:     int64(len(readings)),
		AverageEnergy:     float64(totalEnergy) / float64(len(readings)),
		AverageMood:       float64(totalMood) / float64(len(readings)),
	}, nil
}
