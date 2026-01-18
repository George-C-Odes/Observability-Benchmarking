package cache

import (
	"fmt"
	"strings"
	"time"

	"github.com/Yiling-J/theine-go"
	"github.com/dgraph-io/ristretto/v2"
	"github.com/maypok86/otter/v2"
)

// Cache is the minimal interface used by the app.
// NOTE: keys/values are strings to match Java/Caffeine usage (e.g. getIfPresent("1")).
type Cache interface {
	// Get returns (value, true) if present, otherwise ("", false).
	Get(key string) (string, bool)
	// Size returns the configured maximum size (not the current occupancy).
	Size() int
}

// New creates and pre-populates a cache with keys "1".."size" and values "value-<key>".
// Supported implementations via impl:
//   - "slice"     (fastest, baseline; parses numeric string keys)
//   - "map"       (Go built-in map[string]string)
//   - "ristretto" (github.com/dgraph-io/ristretto/v2)
//   - "theine"    (github.com/Yiling-J/theine-go)        — closest to Caffeine policy-wise
//   - "otter"     (github.com/maypok86/otter/v2)         — Caffeine-inspired API/policy
func New(size int, impl string) (Cache, error) {
	if size <= 0 {
		return nil, fmt.Errorf("cache size must be > 0 (got %d)", size)
	}
	switch strings.ToLower(strings.TrimSpace(impl)) {
	case "", "slice":
		return newSliceCache(size), nil
	case "map":
		return newMapCache(size), nil
	case "ristretto":
		return newRistrettoCache(size)
	case "theine":
		return newTheineCache(size)
	case "otter":
		return newOtterCache(size)
	default:
		return nil, fmt.Errorf("unknown CACHE_IMPL %q (supported: slice,map,ristretto,theine,otter)", impl)
	}
}

const defaultTTL = 24 * time.Hour

// ---------------------------
// slice cache (baseline)
// ---------------------------

type sliceCache struct {
	size   int
	values []string // index == key as int; values[0] unused
}

func newSliceCache(size int) *sliceCache {
	values := make([]string, size+1)
	// Pre-populate, descending to match the Java example, but order doesn't matter.
	for i := size; i >= 1; i-- {
		values[i] = "value-" + itoa(i)
	}
	return &sliceCache{size: size, values: values}
}

func (c *sliceCache) Get(key string) (string, bool) {
	i, ok := parsePositiveIntFast(key)
	if !ok || i <= 0 || i > c.size {
		return "", false
	}
	v := c.values[i]
	if v == "" {
		return "", false
	}
	return v, true
}

func (c *sliceCache) Size() int { return c.size }

// parsePositiveIntFast parses a base-10 positive integer string without allocations.
// Returns (0,false) for invalid input.
func parsePositiveIntFast(s string) (int, bool) {
	if s == "" {
		return 0, false
	}
	n := 0
	for i := 0; i < len(s); i++ {
		ch := s[i]
		if ch < '0' || ch > '9' {
			return 0, false
		}
		n = n*10 + int(ch-'0')
	}
	return n, true
}

// itoa is a tiny non-alloc helper for the prefill path only.
func itoa(n int) string {
	var buf [16]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[i:])
}

// ---------------------------
// map cache
// ---------------------------

type mapCache struct {
	size int
	m    map[string]string
}

func newMapCache(size int) *mapCache {
	m := make(map[string]string, size)
	for i := size; i >= 1; i-- {
		k := itoa(i)
		m[k] = "value-" + k
	}
	return &mapCache{size: size, m: m}
}

func (c *mapCache) Get(key string) (string, bool) {
	v, ok := c.m[key]
	return v, ok
}

func (c *mapCache) Size() int { return c.size }

// ---------------------------
// ristretto cache
// ---------------------------

type ristrettoCache struct {
	size int
	c    *ristretto.Cache[string, string]
}

func newRistrettoCache(size int) (*ristrettoCache, error) {
	// Typical guidance: NumCounters ~ 10x max entries for good hit ratio.
	rc, err := ristretto.NewCache(&ristretto.Config[string, string]{
		NumCounters: int64(size * 10),
		MaxCost:     int64(size),
		BufferItems: 64,
	})
	if err != nil {
		return nil, err
	}

	for i := size; i >= 1; i-- {
		k := itoa(i)
		// Ristretto may drop Set for admission; retry a few times to ensure warm cache.
		retrySetRistretto(rc, k, "value-"+k, 1, defaultTTL)
	}
	rc.Wait()

	return &ristrettoCache{size: size, c: rc}, nil
}

func (c *ristrettoCache) Get(key string) (string, bool) {
	v, ok := c.c.Get(key)
	return v, ok
}

func (c *ristrettoCache) Size() int { return c.size }

func (c *ristrettoCache) Close() { c.c.Close() }

func retrySetRistretto(c *ristretto.Cache[string, string], key, value string, cost int64, ttl time.Duration) {
	for i := 0; i < 16; i++ {
		if c.SetWithTTL(key, value, cost, ttl) {
			return
		}
	}
	_ = c.SetWithTTL(key, value, cost, ttl)
}

// ---------------------------
// theine cache (Caffeine-inspired)
// ---------------------------

type theineCache struct {
	size int
	c    *theine.Cache[string, string]
}

func newTheineCache(size int) (*theineCache, error) {
	tc, err := theine.NewBuilder[string, string](int64(size)).Build()
	if err != nil {
		return nil, err
	}
	for i := size; i >= 1; i-- {
		k := itoa(i)
		_ = tc.SetWithTTL(k, "value-"+k, 1, defaultTTL)
	}
	tc.Wait()
	return &theineCache{size: size, c: tc}, nil
}

func (c *theineCache) Get(key string) (string, bool) { return c.c.Get(key) }
func (c *theineCache) Size() int                     { return c.size }
func (c *theineCache) Close()                        { c.c.Close() }

// ---------------------------
// otter cache (Caffeine-like API)
// ---------------------------

type otterCache struct {
	size int
	c    *otter.Cache[string, string]
}

func newOtterCache(size int) (*otterCache, error) {
	oc, err := otter.New(&otter.Options[string, string]{
		MaximumSize:      size,
		ExpiryCalculator: otter.ExpiryWriting[string, string](defaultTTL),
		Logger:           &otter.NoopLogger{},
	})
	if err != nil {
		return nil, err
	}
	for i := size; i >= 1; i-- {
		k := itoa(i)
		oc.Set(k, "value-"+k)
	}
	oc.CleanUp()
	return &otterCache{size: size, c: oc}, nil
}

func (c *otterCache) Get(key string) (string, bool) { return c.c.GetIfPresent(key) }
func (c *otterCache) Size() int                     { return c.size }
func (c *otterCache) StopAllGoroutines()            { c.c.StopAllGoroutines() }
