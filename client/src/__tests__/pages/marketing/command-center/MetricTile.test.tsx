import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MetricTile } from '@/pages/marketing/command-center/tiles/MetricTile';

describe('MetricTile', () => {
  it('renders label and value with alert styling when alert is true', () => {
    const { container } = render(
      <MetricTile
        label="Test KPI"
        value={42}
        series7d={[
          { date: '2026-03-18', value: 2 },
          { date: '2026-03-19', value: 1 },
        ]}
        alert
      />,
    );
    expect(screen.getByText('Test KPI')).toBeTruthy();
    expect(screen.getByText('42')).toBeTruthy();
    expect(container.querySelector('[class*="border-amber-500"]')).toBeTruthy();
  });
});
