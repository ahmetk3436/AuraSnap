package models

import (
	"time"

	"github.com/google/uuid"
)

type Subscription struct {
	ID                    uuid.UUID  `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	UserID                *uuid.UUID `gorm:"type:uuid;index" json:"user_id,omitempty"`
	RevenueCatID          string     `gorm:"index;size:255" json:"revenuecat_id"`
	OriginalAppUserID     *string    `gorm:"index;size:255" json:"original_app_user_id,omitempty"`
	TransactionID         *string    `gorm:"index;size:255" json:"transaction_id,omitempty"`
	OriginalTransactionID *string    `gorm:"uniqueIndex;size:255" json:"original_transaction_id,omitempty"`
	ProductID             string     `gorm:"size:255" json:"product_id"`
	Status                string     `gorm:"not null;default:'inactive';size:50" json:"status"`
	CurrentPeriodStart    time.Time  `json:"current_period_start"`
	CurrentPeriodEnd      time.Time  `json:"current_period_end"`
	CreatedAt             time.Time  `json:"created_at"`
	UpdatedAt             time.Time  `json:"updated_at"`
	User                  *User      `gorm:"foreignKey:UserID" json:"-"`
}
