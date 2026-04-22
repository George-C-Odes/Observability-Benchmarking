package cache

import (
	"math"
	"strconv"
	"testing"
)

func TestCaches_StringKeysAndValues(t *testing.T) {
	impls := []string{"slice", "map", "ristretto", "theine", "otter"}

	for _, impl := range impls {
		t.Run(impl, func(t *testing.T) {
			c, err := New(50_000, impl)
			if err != nil {
				t.Fatalf("New(%s): %v", impl, err)
			}

			// Hit
			v, ok := c.Get("1")
			if !ok {
				t.Fatalf("%s: expected key \"1\" to be present", impl)
			}
			if v != "value-1" {
				t.Fatalf("%s: expected value %q, got %q", impl, "value-1", v)
			}

			// Miss
			if _, ok := c.Get("999999"); ok {
				t.Fatalf("%s: expected miss for non-existent key", impl)
			}

			if c.Size() != 50_000 {
				t.Fatalf("%s: expected Size()=50000, got %d", impl, c.Size())
			}

			// Best-effort cleanup for implementations that start goroutines.
			closeIfPossible(t, c)
		})
	}
}

func TestSliceCache_ParseFast(t *testing.T) {
	c := newSliceCache(10)

	if v, ok := c.Get("10"); !ok || v != "value-10" {
		t.Fatalf("expected hit for 10")
	}
	if _, ok := c.Get("0"); ok {
		t.Fatalf("expected miss for 0")
	}
	if _, ok := c.Get("-1"); ok {
		t.Fatalf("expected miss for -1")
	}
	if _, ok := c.Get("abc"); ok {
		t.Fatalf("expected miss for abc")
	}
	if _, ok := c.Get("11"); ok {
		t.Fatalf("expected miss for >size")
	}
}

func TestNewValidationAndDefaults(t *testing.T) {
	if _, err := New(0, "map"); err == nil {
		t.Fatal("expected size validation error")
	}
	if _, err := New(10, "unknown"); err == nil {
		t.Fatal("expected unknown implementation error")
	}

	c, err := New(10, "")
	if err != nil {
		t.Fatalf("New default impl: %v", err)
	}
	defer closeIfPossible(t, c)
	if _, ok := c.Get("1"); !ok {
		t.Fatal("expected default implementation to contain key 1")
	}
}

func TestParsePositiveIntFast(t *testing.T) {
	cases := []struct {
		input string
		want  int
		ok    bool
	}{
		{input: "1", want: 1, ok: true},
		{input: "0007", want: 7, ok: true},
		{input: "", ok: false},
		{input: "-1", ok: false},
		{input: "abc", ok: false},
	}

	for _, tc := range cases {
		got, ok := parsePositiveIntFast(tc.input)
		if ok != tc.ok || got != tc.want {
			t.Fatalf("parsePositiveIntFast(%q) = (%d, %v), want (%d, %v)", tc.input, got, ok, tc.want, tc.ok)
		}
	}

	overMax := strconv.Itoa(math.MaxInt) + "1"
	if _, ok := parsePositiveIntFast(overMax); ok {
		t.Fatal("expected overflow to be rejected")
	}
}

func TestItoa(t *testing.T) {
	if got := itoa(1); got != "1" {
		t.Fatalf("itoa(1) = %q", got)
	}
	if got := itoa(12345); got != "12345" {
		t.Fatalf("itoa(12345) = %q", got)
	}
}

func closeIfPossible(t *testing.T, c Cache) {
	t.Helper()
	if err := c.Close(); err != nil {
		t.Errorf("Close() error: %v", err)
	}
}
