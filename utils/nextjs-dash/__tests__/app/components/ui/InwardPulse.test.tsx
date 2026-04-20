import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import { InwardPulse } from '@/app/components/ui/InwardPulse';

describe('InwardPulse', () => {
  it('renders an active pulse ring', () => {
    const { container } = render(
      <InwardPulse active color="#1976d2" inset={8} borderRadius={12} durationMs={750} />,
    );

    expect(container.firstChild).toBeTruthy();
  });

  it('renders an inactive pulse ring with custom sx', () => {
    const { container } = render(
      <InwardPulse active={false} color="#ed6c02" sx={{ top: 0 }} />,
    );

    expect(container.firstChild).toBeTruthy();
  });
});

