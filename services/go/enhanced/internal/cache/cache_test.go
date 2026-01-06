package cache

import "testing"

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

func closeIfPossible(t *testing.T, c Cache) {
	t.Helper()

	switch v := any(c).(type) {
	case interface{ Close() }:
		v.Close()
	case interface{ Close() error }:
		_ = v.Close()
	case interface{ StopAllGoroutines() }:
		v.StopAllGoroutines()
	}
}
