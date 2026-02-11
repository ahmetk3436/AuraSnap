package services

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
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
	db       *gorm.DB
	analyzer *auraAIAnalyzer
}

type auraAIProvider struct {
	name   string
	apiURL string
	apiKey string
	model  string
}

type auraAIAnalyzer struct {
	providers []auraAIProvider
	client    *http.Client
}

type auraAnalysisResult struct {
	AuraColor      string  `json:"aura_color"`
	SecondaryColor *string `json:"secondary_color,omitempty"`
	EnergyLevel    int     `json:"energy_level"`
	MoodScore      int     `json:"mood_score"`
}

type auraChatCompletionRequest struct {
	Model          string            `json:"model"`
	Messages       []auraChatMessage `json:"messages"`
	Temperature    float64           `json:"temperature,omitempty"`
	ResponseFormat map[string]string `json:"response_format,omitempty"`
}

type auraChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type auraChatCompletionResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
}

func NewAuraService(db *gorm.DB, cfg *config.Config) *AuraService {
	return &AuraService{
		db:       db,
		analyzer: newAuraAIAnalyzer(cfg),
	}
}

func newAuraAIAnalyzer(cfg *config.Config) *auraAIAnalyzer {
	timeout := cfg.AuraAITimeout
	if timeout <= 0 {
		timeout = 20 * time.Second
	}

	providers := make([]auraAIProvider, 0, 2)

	if strings.TrimSpace(cfg.GLMAPIKey) != "" {
		providers = append(providers, auraAIProvider{
			name:   "glm",
			apiURL: strings.TrimSpace(cfg.GLMAPIURL),
			apiKey: strings.TrimSpace(cfg.GLMAPIKey),
			model:  strings.TrimSpace(cfg.GLMModel),
		})
	}
	if strings.TrimSpace(cfg.DeepSeekAPIKey) != "" {
		providers = append(providers, auraAIProvider{
			name:   "deepseek",
			apiURL: strings.TrimSpace(cfg.DeepSeekAPIURL),
			apiKey: strings.TrimSpace(cfg.DeepSeekAPIKey),
			model:  strings.TrimSpace(cfg.DeepSeekModel),
		})
	}

	return &auraAIAnalyzer{
		providers: providers,
		client:    &http.Client{Timeout: timeout},
	}
}

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

var auraColors = []string{"red", "orange", "yellow", "green", "blue", "indigo", "violet", "white", "gold", "pink"}
var secondaryColors = []string{"silver", "gold", "white", "black", "grey"}

func (s *AuraService) Create(userID uuid.UUID, req dto.CreateAuraRequest) (*models.AuraReading, error) {
	imageURL := strings.TrimSpace(req.ImageURL)
	if imageURL == "" {
		return nil, errors.New("image_url is required")
	}

	analysis := deterministicAuraResult(userID, imageURL)
	if aiAnalysis, err := s.analyzer.analyze(imageURL, analysis); err == nil {
		analysis = aiAnalysis
	}

	traits, ok := colorTraits[analysis.AuraColor]
	if !ok {
		traits = colorTraits["violet"]
		analysis.AuraColor = "violet"
	}

	reading := &models.AuraReading{
		UserID:         userID,
		ImageURL:       imageURL,
		AuraColor:      analysis.AuraColor,
		SecondaryColor: analysis.SecondaryColor,
		EnergyLevel:    clamp(analysis.EnergyLevel, 1, 100),
		MoodScore:      clamp(analysis.MoodScore, 1, 10),
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

func deterministicAuraResult(userID uuid.UUID, imageURL string) auraAnalysisResult {
	seedInput := strings.ToLower(strings.TrimSpace(imageURL)) + ":" + userID.String()
	hash := sha256.Sum256([]byte(seedInput))

	color := auraColors[int(hash[0])%len(auraColors)]
	energy := 45 + int(hash[1])%51 // 45..95
	mood := 5 + int(hash[2])%6     // 5..10

	var secondary *string
	if int(hash[3])%4 == 0 { // 25% chance
		candidate := secondaryColors[int(hash[4])%len(secondaryColors)]
		if candidate != color {
			secondary = &candidate
		}
	}

	return auraAnalysisResult{
		AuraColor:      color,
		SecondaryColor: secondary,
		EnergyLevel:    energy,
		MoodScore:      mood,
	}
}

func (a *auraAIAnalyzer) analyze(imageURL string, base auraAnalysisResult) (auraAnalysisResult, error) {
	if a == nil || len(a.providers) == 0 {
		return base, errors.New("aura ai analyzer disabled")
	}

	var lastErr error
	for _, provider := range a.providers {
		result, err := a.analyzeWithProvider(provider, imageURL, base)
		if err == nil {
			return result, nil
		}
		lastErr = fmt.Errorf("%s provider failed: %w", provider.name, err)
	}

	if lastErr != nil {
		return base, lastErr
	}
	return base, errors.New("no aura ai provider available")
}

func (a *auraAIAnalyzer) analyzeWithProvider(provider auraAIProvider, imageURL string, base auraAnalysisResult) (auraAnalysisResult, error) {
	prompt := fmt.Sprintf(
		"Analyze this aura image URL and return only JSON. image_url=%q allowed_colors=%v fallback=%+v. Output keys: aura_color (string), secondary_color (string or null), energy_level (1-100), mood_score (1-10). Keep results realistic.",
		imageURL,
		auraColors,
		base,
	)

	reqBody := auraChatCompletionRequest{
		Model: provider.model,
		Messages: []auraChatMessage{
			{Role: "system", Content: "You are an aura analysis engine. Return valid JSON only."},
			{Role: "user", Content: prompt},
		},
		Temperature:    0.2,
		ResponseFormat: map[string]string{"type": "json_object"},
	}

	payload, err := json.Marshal(reqBody)
	if err != nil {
		return base, err
	}

	req, err := http.NewRequest(http.MethodPost, provider.apiURL, bytes.NewReader(payload))
	if err != nil {
		return base, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+provider.apiKey)

	resp, err := a.client.Do(req)
	if err != nil {
		return base, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return base, err
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return base, fmt.Errorf("aura ai request failed: status=%d", resp.StatusCode)
	}

	var completion auraChatCompletionResponse
	if err := json.Unmarshal(respBody, &completion); err != nil {
		return base, err
	}
	if len(completion.Choices) == 0 {
		return base, errors.New("aura ai returned no choices")
	}

	content := strings.TrimSpace(completion.Choices[0].Message.Content)
	parsed, err := parseAuraAIContent(content)
	if err != nil {
		return base, err
	}

	return mergeAuraAnalysis(base, parsed), nil
}

func parseAuraAIContent(content string) (auraAnalysisResult, error) {
	if strings.TrimSpace(content) == "" {
		return auraAnalysisResult{}, errors.New("empty aura ai content")
	}

	parsed, ok := parseAuraJSON(content)
	if ok {
		return parsed, nil
	}

	start := strings.Index(content, "{")
	end := strings.LastIndex(content, "}")
	if start >= 0 && end > start {
		parsed, ok = parseAuraJSON(content[start : end+1])
		if ok {
			return parsed, nil
		}
	}

	return auraAnalysisResult{}, errors.New("could not parse aura ai response")
}

func parseAuraJSON(raw string) (auraAnalysisResult, bool) {
	var parsed auraAnalysisResult
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		return auraAnalysisResult{}, false
	}

	parsed.AuraColor = normalizeAuraColor(parsed.AuraColor)
	if parsed.AuraColor == "" {
		return auraAnalysisResult{}, false
	}
	parsed.EnergyLevel = clamp(parsed.EnergyLevel, 1, 100)
	parsed.MoodScore = clamp(parsed.MoodScore, 1, 10)

	if parsed.SecondaryColor != nil {
		t := strings.TrimSpace(strings.ToLower(*parsed.SecondaryColor))
		if t == "" || t == "null" {
			parsed.SecondaryColor = nil
		} else {
			parsed.SecondaryColor = &t
		}
	}

	return parsed, true
}

func mergeAuraAnalysis(base, incoming auraAnalysisResult) auraAnalysisResult {
	result := base

	if incoming.AuraColor != "" {
		result.AuraColor = normalizeAuraColor(incoming.AuraColor)
	}
	if incoming.SecondaryColor != nil {
		result.SecondaryColor = incoming.SecondaryColor
	}
	if incoming.EnergyLevel > 0 {
		result.EnergyLevel = clamp(incoming.EnergyLevel, 1, 100)
	}
	if incoming.MoodScore > 0 {
		result.MoodScore = clamp(incoming.MoodScore, 1, 10)
	}

	if result.AuraColor == "" {
		result.AuraColor = "violet"
	}

	return result
}

func normalizeAuraColor(color string) string {
	normalized := strings.ToLower(strings.TrimSpace(color))
	for _, c := range auraColors {
		if normalized == c {
			return normalized
		}
	}
	return ""
}

func clamp(v, minV, maxV int) int {
	if v < minV {
		return minV
	}
	if v > maxV {
		return maxV
	}
	return v
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
