import { render, screen } from '@testing-library/react';
import { describe, it, vi, expect } from 'vitest';
import { CultureCard } from '@/pages/executive/components/departments/CultureCard';

describe('CultureCard', () => {
  it('renders N/A metrics when culture data is null without throwing', () => {
    render(<CultureCard data={null} onAction={vi.fn()} />);
    const na = screen.getAllByText('N/A');
    expect(na.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Culture / Heart')).toBeInTheDocument();
    expect(screen.getByText('Stable')).toBeInTheDocument();
  });

  it('renders formatted scores when culture data is present', () => {
    render(
      <CultureCard
        data={{ healthScore: 72, engagementTrend: 'improving', sentimentAvg: 4.2 }}
        onAction={vi.fn()}
      />,
    );
    expect(screen.getByText('72')).toBeInTheDocument();
    expect(screen.getByText('4.2')).toBeInTheDocument();
    expect(screen.getByText('Improving')).toBeInTheDocument();
  });
});
