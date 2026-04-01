import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

// ── Module mocks (hoisted by Vitest before any imports) ─────────────

// Factory mock is intentional: BootLogger pulls in a heavy dependency tree
// (fetchJson, clientLogger, loggingConfig, systemInfo, runtimeConfig).
// A factory mock avoids loading all of them.  The property is consumed as a
// module export by Vitest's mock system, not by test code directly, so the
// IDE flags a false-positive "unused property".
// noinspection JSUnusedGlobalSymbols
vi.mock('./components/BootLogger', () => ({
  BootLogger: () => null,
}));

// Auto-mock: prevents installConsoleCapture from patching console.* in tests.
// The module has no runtime side-effects at load time, so auto-mock is safe.
vi.mock('@/lib/clientLogs');

// Auto-mock: themeStorage is controlled via vi.mocked() aliases below.
vi.mock('@/lib/themeStorage');

// ── Imports (resolve to mocked modules thanks to vi.mock hoisting) ──
import Providers, { useDashboardTheme } from './Providers';
import { themeOptions } from './theme';
import { readStoredTheme, writeStoredTheme } from '@/lib/themeStorage';

// Typed mock aliases — keeps the rest of the test unchanged.
const mockReadStoredTheme = vi.mocked(readStoredTheme);
mockReadStoredTheme.mockReturnValue(null);
const mockWriteStoredTheme = vi.mocked(writeStoredTheme);

// ── Helpers ───────────────────────────────────────────────────────────

function wrapper({ children }: { children: ReactNode }) {
  return <Providers>{children}</Providers>;
}

// ── Setup / teardown ─────────────────────────────────────────────────

beforeEach(() => {
  // Reset DOM state used by getInitialTheme / useEffect.
  delete document.documentElement.dataset.dashboardTheme;
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

// ── useDashboardTheme ─────────────────────────────────────────────────

describe('useDashboardTheme', () => {
  it('throws when used outside <Providers />', () => {
    // renderHook without wrapper → no context provider → should throw
    expect(() => {
      renderHook(() => useDashboardTheme());
    }).toThrow('useDashboardTheme must be used within <Providers />');
  });

  it('returns the current theme and a setter when inside <Providers />', () => {
    const { result } = renderHook(() => useDashboardTheme(), { wrapper });
    expect(result.current.currentTheme).toBe('dark');
    expect(typeof result.current.setCurrentTheme).toBe('function');
  });
});

// ── Theme selection / sanitization ───────────────────────────────────

describe('theme sanitization', () => {
  it('defaults to "dark" when no stored theme or dataset attribute exists', () => {
    const { result } = renderHook(() => useDashboardTheme(), { wrapper });
    expect(result.current.currentTheme).toBe('dark');
  });

  it('picks up a valid theme id from the dataset attribute', () => {
    document.documentElement.dataset.dashboardTheme = 'cyberpunk';
    const { result } = renderHook(() => useDashboardTheme(), { wrapper });
    expect(result.current.currentTheme).toBe('cyberpunk');
  });

  it('falls back to "dark" when the dataset attribute has an invalid id', () => {
    document.documentElement.dataset.dashboardTheme = 'totally-bogus';
    const { result } = renderHook(() => useDashboardTheme(), { wrapper });
    expect(result.current.currentTheme).toBe('dark');
  });

  it('falls back to localStorage when no dataset attribute is set', () => {
    mockReadStoredTheme.mockReturnValueOnce('nord');
    const { result } = renderHook(() => useDashboardTheme(), { wrapper });
    expect(result.current.currentTheme).toBe('nord');
  });

  it('sanitizes an invalid setCurrentTheme value to "dark"', () => {
    const { result } = renderHook(() => useDashboardTheme(), { wrapper });

    act(() => {
      result.current.setCurrentTheme('does-not-exist');
    });

    expect(result.current.currentTheme).toBe('dark');
  });

  it('allows switching to any known theme id', () => {
    const target = themeOptions.find((t) => t.id === 'sakura')!;
    const { result } = renderHook(() => useDashboardTheme(), { wrapper });

    act(() => {
      result.current.setCurrentTheme(target.id);
    });

    expect(result.current.currentTheme).toBe('sakura');
  });
});

// ── localStorage wiring ──────────────────────────────────────────────

describe('localStorage integration', () => {
  it('writes the current theme to storage on mount', () => {
    renderHook(() => useDashboardTheme(), { wrapper });
    expect(mockWriteStoredTheme).toHaveBeenCalledWith('dark');
  });

  it('writes updated theme to storage when theme changes', () => {
    const { result } = renderHook(() => useDashboardTheme(), { wrapper });

    act(() => {
      result.current.setCurrentTheme('matrix');
    });

    expect(mockWriteStoredTheme).toHaveBeenCalledWith('matrix');
  });
});

// ── dataset attribute sync ───────────────────────────────────────────

describe('dataset attribute sync', () => {
  it('updates document.documentElement.dataset.dashboardTheme on change', () => {
    const { result } = renderHook(() => useDashboardTheme(), { wrapper });

    act(() => {
      result.current.setCurrentTheme('dracula');
    });

    expect(document.documentElement.dataset.dashboardTheme).toBe('dracula');
  });
});

// ── Rendering ─────────────────────────────────────────────────────────

describe('Providers rendering', () => {
  it('renders children', () => {
    render(
      <Providers>
        <span data-testid="child">hello</span>
      </Providers>,
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});