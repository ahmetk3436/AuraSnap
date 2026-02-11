package services

import (
	"context"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	appleIssuer  = "https://appleid.apple.com"
	appleJWKSURL = "https://appleid.apple.com/auth/keys"
)

type appleJWKS struct {
	Keys []appleJWK `json:"keys"`
}

type appleJWK struct {
	Kty string `json:"kty"`
	Kid string `json:"kid"`
	Use string `json:"use"`
	Alg string `json:"alg"`
	N   string `json:"n"`
	E   string `json:"e"`
}

type appleKeyCache struct {
	mu        sync.RWMutex
	keysByKID map[string]*rsa.PublicKey
	fetchedAt time.Time
}

var appleKeys appleKeyCache

func verifyAppleIdentityToken(ctx context.Context, tokenStr string, allowedAudiences []string) (jwt.MapClaims, error) {
	parsed, err := jwt.Parse(tokenStr, func(token *jwt.Token) (interface{}, error) {
		if token.Method.Alg() != jwt.SigningMethodRS256.Alg() {
			return nil, fmt.Errorf("unexpected signing method: %s", token.Method.Alg())
		}

		kid, _ := token.Header["kid"].(string)
		if kid == "" {
			return nil, errors.New("missing kid")
		}

		key, err := getApplePublicKey(ctx, kid)
		if err != nil {
			return nil, err
		}
		return key, nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodRS256.Alg()}))
	if err != nil {
		return nil, fmt.Errorf("invalid identity token: %w", err)
	}
	if !parsed.Valid {
		return nil, errors.New("invalid identity token")
	}

	claims, ok := parsed.Claims.(jwt.MapClaims)
	if !ok {
		return nil, errors.New("invalid identity token claims")
	}

	iss, _ := claims["iss"].(string)
	if iss != appleIssuer {
		return nil, fmt.Errorf("invalid issuer: %s", iss)
	}

	expRaw, ok := claims["exp"]
	if !ok {
		return nil, errors.New("missing exp")
	}
	expUnix, ok := expRaw.(float64)
	if !ok {
		return nil, errors.New("invalid exp")
	}
	if time.Now().After(time.Unix(int64(expUnix), 0).Add(60 * time.Second)) {
		return nil, errors.New("token expired")
	}

	if len(allowedAudiences) > 0 {
		aud := extractAudience(claims["aud"])
		if !anyInCommon(aud, allowedAudiences) {
			return nil, errors.New("invalid audience")
		}
	}

	return claims, nil
}

func extractAudience(v interface{}) []string {
	switch t := v.(type) {
	case string:
		if t == "" {
			return nil
		}
		return []string{t}
	case []interface{}:
		out := make([]string, 0, len(t))
		for _, x := range t {
			if s, ok := x.(string); ok && s != "" {
				out = append(out, s)
			}
		}
		return out
	case []string:
		out := make([]string, 0, len(t))
		for _, s := range t {
			if s != "" {
				out = append(out, s)
			}
		}
		return out
	default:
		return nil
	}
}

func anyInCommon(a, b []string) bool {
	set := make(map[string]struct{}, len(a))
	for _, s := range a {
		set[s] = struct{}{}
	}
	for _, s := range b {
		if _, ok := set[s]; ok {
			return true
		}
	}
	return false
}

func getApplePublicKey(ctx context.Context, kid string) (*rsa.PublicKey, error) {
	// Fast path: cache hit.
	appleKeys.mu.RLock()
	if appleKeys.keysByKID != nil && time.Since(appleKeys.fetchedAt) < 24*time.Hour {
		if key := appleKeys.keysByKID[kid]; key != nil {
			appleKeys.mu.RUnlock()
			return key, nil
		}
	}
	appleKeys.mu.RUnlock()

	// Refresh keys (or fetch missing kid).
	appleKeys.mu.Lock()
	defer appleKeys.mu.Unlock()

	needFetch := appleKeys.keysByKID == nil || time.Since(appleKeys.fetchedAt) >= 24*time.Hour || appleKeys.keysByKID[kid] == nil
	if needFetch {
		keys, err := fetchAppleKeys(ctx)
		if err != nil {
			return nil, err
		}
		appleKeys.keysByKID = keys
		appleKeys.fetchedAt = time.Now()
	}

	if key := appleKeys.keysByKID[kid]; key != nil {
		return key, nil
	}
	return nil, errors.New("apple public key not found for kid")
}

func fetchAppleKeys(ctx context.Context) (map[string]*rsa.PublicKey, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, appleJWKSURL, nil)
	if err != nil {
		return nil, err
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch apple jwks: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("apple jwks http status: %s", resp.Status)
	}

	var jwks appleJWKS
	if err := json.NewDecoder(resp.Body).Decode(&jwks); err != nil {
		return nil, fmt.Errorf("failed to parse apple jwks: %w", err)
	}

	out := make(map[string]*rsa.PublicKey, len(jwks.Keys))
	for _, k := range jwks.Keys {
		if k.Kid == "" || k.N == "" || k.E == "" {
			continue
		}
		pub, err := jwkToRSAPublicKey(k)
		if err != nil {
			continue
		}
		out[k.Kid] = pub
	}

	if len(out) == 0 {
		return nil, errors.New("no apple jwks keys available")
	}
	return out, nil
}

func jwkToRSAPublicKey(k appleJWK) (*rsa.PublicKey, error) {
	if k.Kty != "RSA" {
		return nil, errors.New("unsupported key type")
	}

	nb, err := base64.RawURLEncoding.DecodeString(k.N)
	if err != nil {
		return nil, err
	}
	eb, err := base64.RawURLEncoding.DecodeString(k.E)
	if err != nil {
		return nil, err
	}

	n := new(big.Int).SetBytes(nb)
	e := 0
	for _, b := range eb {
		e = e<<8 + int(b)
	}
	if e == 0 {
		return nil, errors.New("invalid exponent")
	}

	return &rsa.PublicKey{N: n, E: e}, nil
}
