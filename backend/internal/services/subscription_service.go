package services

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/ahmetcoskunkizilkaya/aurasnap/backend/internal/dto"
	"github.com/ahmetcoskunkizilkaya/aurasnap/backend/internal/models"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type SubscriptionService struct {
	db *gorm.DB
}

func NewSubscriptionService(db *gorm.DB) *SubscriptionService {
	return &SubscriptionService{db: db}
}

func (s *SubscriptionService) HandleWebhookEvent(event *dto.RevenueCatEvent) error {
	status := ""
	switch event.Type {
	case "INITIAL_PURCHASE", "RENEWAL":
		status = "active"
	case "CANCELLATION":
		status = "cancelled"
	case "EXPIRATION":
		status = "expired"
	default:
		// Ignore unknown event types (RevenueCat adds new ones over time).
		return nil
	}
	return s.upsertSubscription(event, status)
}

func (s *SubscriptionService) upsertSubscription(event *dto.RevenueCatEvent, status string) error {
	var sub models.Subscription
	var err error

	originalTx := strings.TrimSpace(event.OriginalTransactionID)
	if originalTx != "" {
		err = s.db.Where("original_transaction_id = ?", originalTx).First(&sub).Error
	} else {
		err = s.db.Where("revenuecat_id = ?", event.AppUserID).First(&sub).Error
	}

	if errors.Is(err, gorm.ErrRecordNotFound) {
		sub = models.Subscription{ID: uuid.New()}
		sub.RevenueCatID = event.AppUserID
		sub.ProductID = event.ProductID
		sub.Status = status
		sub.CurrentPeriodStart = msToTime(event.PurchasedAtMs)
		sub.CurrentPeriodEnd = msToTime(event.ExpirationAtMs)

		if v := strings.TrimSpace(event.OriginalAppUserID); v != "" {
			sub.OriginalAppUserID = &v
		}
		if v := strings.TrimSpace(event.TransactionID); v != "" {
			sub.TransactionID = &v
		}
		if originalTx != "" {
			sub.OriginalTransactionID = &originalTx
		}
		if userID := s.lookupUserID(event.AppUserID, event.OriginalAppUserID); userID != nil {
			sub.UserID = userID
		}

		return s.db.Create(&sub).Error
	}
	if err != nil {
		return fmt.Errorf("failed to lookup subscription: %w", err)
	}

	updates := map[string]interface{}{
		"revenuecat_id":        event.AppUserID,
		"product_id":           event.ProductID,
		"status":               status,
		"current_period_start": msToTime(event.PurchasedAtMs),
		"current_period_end":   msToTime(event.ExpirationAtMs),
	}
	if v := strings.TrimSpace(event.OriginalAppUserID); v != "" {
		updates["original_app_user_id"] = v
	}
	if v := strings.TrimSpace(event.TransactionID); v != "" {
		updates["transaction_id"] = v
	}
	if originalTx != "" {
		updates["original_transaction_id"] = originalTx
	}
	if userID := s.lookupUserID(event.AppUserID, event.OriginalAppUserID); userID != nil {
		updates["user_id"] = *userID
	}

	return s.db.Model(&sub).Updates(updates).Error
}

func (s *SubscriptionService) lookupUserID(appUserID, originalAppUserID string) *uuid.UUID {
	candidates := []string{appUserID, originalAppUserID}
	for _, c := range candidates {
		c = strings.TrimSpace(c)
		if c == "" {
			continue
		}

		id, err := uuid.Parse(c)
		if err != nil {
			continue
		}

		var user models.User
		if err := s.db.Select("id").First(&user, "id = ?", id).Error; err == nil {
			return &user.ID
		}
	}

	return nil
}

func msToTime(ms int64) time.Time {
	return time.Unix(ms/1000, (ms%1000)*int64(time.Millisecond))
}
