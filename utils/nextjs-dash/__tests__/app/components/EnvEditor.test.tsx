import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ── Module mocks ──────────────────────────────────────────────────────

// noinspection JSUnusedGlobalSymbols — consumed by vi.mock, not test code
const mocks = vi.hoisted(() => ({
  clientLogger: {
    createClientLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  inwardPulse: { InwardPulse: () => null },
  timedPulse: { useTimedPulse: () => ({ on: false, fire: vi.fn() }) },
}));
vi.mock('@/lib/clientLogger', () => mocks.clientLogger);
vi.mock('@/app/components/ui/InwardPulse', () => mocks.inwardPulse);
vi.mock('@/app/hooks/useTimedPulse', () => mocks.timedPulse);

import EnvEditor from '@/app/components/EnvEditor';

// ── Helpers ───────────────────────────────────────────────────────────

const SAMPLE_ENV = `# Project root
HOST_REPO: /home/user/project
# FYI: read-only value
COMPOSE_PROJECT_NAME: obs-bench
# Load settings
RATE: 100
DURATION: 30s`;

function mockFetchEnv(content = SAMPLE_ENV) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();

    if (url === '/api/env' && method === 'GET') {
      return new Response(JSON.stringify({ content }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === '/api/env' && method === 'POST') {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not found', { status: 404 });
  });
}

function mockFetchEnvError() {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response('Server error', { status: 500 }),
  );
}

// ── Setup / teardown ──────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

// ── Tests ─────────────────────────────────────────────────────────────

describe('EnvEditor', () => {
  it('shows loading spinner initially', () => {
    // Don't resolve fetch yet
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
    render(<EnvEditor />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('renders the heading after loading', async () => {
    mockFetchEnv();
    render(<EnvEditor />);

    expect(await screen.findByText('Environment Configuration Editor')).toBeInTheDocument();
  });

  it('displays parsed environment variables as text fields', async () => {
    mockFetchEnv();
    render(<EnvEditor />);

    // Wait for loading to finish
    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    expect(screen.getByLabelText('HOST_REPO')).toBeInTheDocument();
    expect(screen.getByLabelText('HOST_REPO')).toHaveValue('/home/user/project');
    expect(screen.getByLabelText('COMPOSE_PROJECT_NAME')).toBeInTheDocument();
    expect(screen.getByLabelText('RATE')).toBeInTheDocument();
    expect(screen.getByLabelText('DURATION')).toBeInTheDocument();
  });

  it('marks FYI-commented variables as read-only (disabled)', async () => {
    mockFetchEnv();
    render(<EnvEditor />);

    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    // COMPOSE_PROJECT_NAME has "FYI" in its comment → disabled
    expect(screen.getByLabelText('COMPOSE_PROJECT_NAME')).toBeDisabled();
    // HOST_REPO does not have "FYI" → enabled
    expect(screen.getByLabelText('HOST_REPO')).not.toBeDisabled();
  });

  it('shows error message when fetch fails', async () => {
    mockFetchEnvError();
    render(<EnvEditor />);

    expect(await screen.findByText('Failed to load environment file')).toBeInTheDocument();
  });

  it('allows editing a variable value', async () => {
    mockFetchEnv();
    const user = userEvent.setup();
    render(<EnvEditor />);

    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    const rateInput = screen.getByLabelText('RATE');
    await user.clear(rateInput);
    await user.type(rateInput, '200');
    expect(rateInput).toHaveValue('200');
  });

  it('saves changes when Save button is clicked', async () => {
    mockFetchEnv();
    const user = userEvent.setup();
    render(<EnvEditor />);

    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    const saveBtn = screen.getByRole('button', { name: /Save Changes/i });
    await user.click(saveBtn);

    // Expect success message
    expect(await screen.findByText('Environment file saved successfully!')).toBeInTheDocument();

    // Verify POST was called
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/env',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('shows error when save fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();

      if (url === '/api/env' && method === 'GET') {
        return new Response(JSON.stringify({ content: SAMPLE_ENV }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url === '/api/env' && method === 'POST') {
        return new Response('Error', { status: 500 });
      }

      return new Response('Not found', { status: 404 });
    });

    const user = userEvent.setup();
    render(<EnvEditor />);

    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Save Changes/i }));

    expect(await screen.findByText('Failed to save environment file')).toBeInTheDocument();
  });

  it('reloads env file when Reload button is clicked', async () => {
    mockFetchEnv();
    const user = userEvent.setup();
    render(<EnvEditor />);

    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    // Clear calls and click reload
    vi.mocked(globalThis.fetch).mockClear();
    mockFetchEnv('HOST_REPO: /updated/path\nRATE: 999');

    await user.click(screen.getByRole('button', { name: /Reload/i }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/env',
        expect.objectContaining({ method: 'GET' }),
      );
    });
  });

  it('shows helper text for empty HOST_REPO', async () => {
    mockFetchEnv('# Project root\nHOST_REPO: \nRATE: 100');
    render(<EnvEditor />);

    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    expect(screen.getByText('HOST_REPO not set in .env')).toBeInTheDocument();
  });

  it('does not show helper text when HOST_REPO has a value', async () => {
    mockFetchEnv();
    render(<EnvEditor />);

    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    expect(screen.queryByText('HOST_REPO not set in .env')).not.toBeInTheDocument();
  });

  it('parses multi-colon values correctly (e.g. paths with colons)', async () => {
    mockFetchEnv('URL: http://localhost:8080');
    render(<EnvEditor />);

    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    expect(screen.getByLabelText('URL')).toHaveValue('http://localhost:8080');
  });

  it('dismisses alert when close button is clicked', async () => {
    mockFetchEnv();
    const user = userEvent.setup();
    render(<EnvEditor />);

    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    // Save to trigger success message
    await user.click(screen.getByRole('button', { name: /Save Changes/i }));
    expect(await screen.findByText('Environment file saved successfully!')).toBeInTheDocument();

    // Close the alert
    const closeBtn = screen.getByRole('button', { name: /close/i });
    await user.click(closeBtn);

    expect(screen.queryByText('Environment file saved successfully!')).not.toBeInTheDocument();
  });

  it('renders subtitle text', async () => {
    mockFetchEnv();
    render(<EnvEditor />);

    expect(
      await screen.findByText('Edit the configuration values of the compose/.env file'),
    ).toBeInTheDocument();
  });
});