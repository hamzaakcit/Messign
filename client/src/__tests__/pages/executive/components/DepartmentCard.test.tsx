import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, vi, expect } from 'vitest';
import { DepartmentCard } from '@/pages/executive/components/DepartmentCard';
import { TrendingUp } from 'lucide-react';

describe('DepartmentCard', () => {
  const baseProps = {
    id: 'test-dept',
    title: 'Test Department',
    icon: <TrendingUp className="w-4 h-4" />,
    iconColor: '#3b82f6',
    metrics: [
      { label: 'Metric A', value: '42' },
      { label: 'Metric B', value: 100, suffix: '%' },
    ],
    actionLabel: 'Take Action',
    onAction: vi.fn(),
  };

  it('renders title and metrics', () => {
    render(<DepartmentCard {...baseProps} />);
    expect(screen.getByText('Test Department')).toBeInTheDocument();
    expect(screen.getByText('Metric A')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders action button and calls onAction when clicked', () => {
    const onAction = vi.fn();
    render(<DepartmentCard {...baseProps} onAction={onAction} />);
    fireEvent.click(screen.getByTestId('action-btn-test-dept'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('shows pending count badge when provided', () => {
    render(<DepartmentCard {...baseProps} pendingCount={5} />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('does not show badge when pendingCount is 0', () => {
    const { container } = render(<DepartmentCard {...baseProps} pendingCount={0} />);
    const badges = container.querySelectorAll('[class*="bg-amber"]');
    expect(badges.length).toBe(0);
  });

  it('renders chart when provided', () => {
    render(<DepartmentCard {...baseProps} chart={<div data-testid="test-chart">Chart</div>} />);
    expect(screen.getByTestId('test-chart')).toBeInTheDocument();
  });

  it('has correct data-testid', () => {
    render(<DepartmentCard {...baseProps} />);
    expect(screen.getByTestId('dept-card-test-dept')).toBeInTheDocument();
  });
});
