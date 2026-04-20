import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import ProjectHub from '@/app/components/ProjectHub';

describe('ProjectHub', () => {
  it('renders all resource sections and author links', () => {
    render(<ProjectHub />);

    expect(screen.getByText('Project Hub')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Orchestrator' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Project' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Author' })).toBeInTheDocument();
    expect(screen.getAllByText('Grafana').length).toBeGreaterThan(0);

    expect(document.querySelector('a[href="http://localhost:3002/q/swagger-ui/"]')).toBeTruthy();
    expect(document.querySelector('a[href="http://localhost:3000"]')).toBeTruthy();
    expect(document.querySelector('a[href="https://george-c-odes.github.io/Observability-Benchmarking/"]')).toBeTruthy();
    expect(document.querySelector('a[href="mailto:georgecha@gmail.com"]')).toBeTruthy();
    expect(document.querySelector('a[href="https://www.linkedin.com/in/george-charalambous-114648203/"]')).toBeTruthy();
    expect(document.querySelector('a[href="https://github.com/George-C-Odes"]')).toBeTruthy();

    expect(screen.getByText('George Charalambous')).toBeInTheDocument();
    expect(screen.getByText('Maintainer')).toBeInTheDocument();
    expect(screen.getByAltText('Author')).toBeInTheDocument();
  });
});

