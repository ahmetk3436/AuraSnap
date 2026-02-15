package services

import (
	"testing"

	"github.com/ahmetcoskunkizilkaya/aurasnap/backend/internal/config"
	"github.com/google/uuid"
)

func TestDeterministicAuraResultStable(t *testing.T) {
	userID := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	imageURL := "https://cdn.example.com/user/aura-photo-1.jpg"

	first := deterministicAuraResult(userID, imageURL)
	second := deterministicAuraResult(userID, imageURL)

	if first != second {
		t.Fatalf("deterministic result changed between runs: %#v vs %#v", first, second)
	}
	if normalizeAuraColor(first.AuraColor) == "" {
		t.Fatalf("invalid aura color: %q", first.AuraColor)
	}
	if first.EnergyLevel < 1 || first.EnergyLevel > 100 {
		t.Fatalf("energy out of range: %d", first.EnergyLevel)
	}
	if first.MoodScore < 1 || first.MoodScore > 10 {
		t.Fatalf("mood out of range: %d", first.MoodScore)
	}
}

func TestParseAuraAIContentJSON(t *testing.T) {
	content := `{"aura_color":"Blue","secondary_color":"gold","energy_level":88,"mood_score":9}`
	parsed, err := parseAuraAIContent(content)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if parsed.AuraColor != "blue" {
		t.Fatalf("expected blue, got %s", parsed.AuraColor)
	}
	if parsed.SecondaryColor == nil || *parsed.SecondaryColor != "gold" {
		t.Fatalf("unexpected secondary color: %#v", parsed.SecondaryColor)
	}
	if parsed.EnergyLevel != 88 {
		t.Fatalf("expected energy 88, got %d", parsed.EnergyLevel)
	}
	if parsed.MoodScore != 9 {
		t.Fatalf("expected mood 9, got %d", parsed.MoodScore)
	}
}

func TestMergeAuraAnalysisFallbackBehavior(t *testing.T) {
	base := auraAnalysisResult{AuraColor: "red", EnergyLevel: 50, MoodScore: 7}
	incoming := auraAnalysisResult{AuraColor: "", EnergyLevel: 120, MoodScore: 0}

	merged := mergeAuraAnalysis(base, incoming)

	if merged.AuraColor != "red" {
		t.Fatalf("expected base color red, got %s", merged.AuraColor)
	}
	if merged.EnergyLevel != 100 {
		t.Fatalf("expected clamped energy 100, got %d", merged.EnergyLevel)
	}
	if merged.MoodScore != 7 {
		t.Fatalf("expected base mood 7, got %d", merged.MoodScore)
	}
}

func TestAuraProviderPriorityGLMFirst(t *testing.T) {
	cfg := &config.Config{
		GLMAPIKey:      "glm-key",
		GLMAPIURL:      "https://api.z.ai/api/paas/v4/chat/completions",
		GLMModel:       "glm-4.7",
		DeepSeekAPIKey: "ds-key",
		DeepSeekAPIURL: "https://api.deepseek.com/chat/completions",
		DeepSeekModel:  "deepseek-chat",
	}

	analyzer := newAuraAIAnalyzer(cfg)
	if len(analyzer.providers) != 2 {
		t.Fatalf("expected 2 providers, got %d", len(analyzer.providers))
	}
	if analyzer.providers[0].name != "glm" {
		t.Fatalf("expected glm first, got %s", analyzer.providers[0].name)
	}
	if analyzer.providers[1].name != "deepseek" {
		t.Fatalf("expected deepseek second, got %s", analyzer.providers[1].name)
	}
}
