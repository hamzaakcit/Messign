import { render, screen } from '@testing-library/react';
import { ViewportContainer } from '@/components/layout/ViewportContainer';
import { BentoGrid } from '@/components/layout/bento/BentoGrid';
import { BentoModule } from '@/components/layout/bento/BentoModule';

describe('ViewportContainer', () => {
  it('locks overflow and sets compact density marker', () => {
    render(
      <ViewportContainer density="compact" data-testid="vp">
        <span>child</span>
      </ViewportContainer>,
    );
    const el = screen.getByTestId('vp');
    expect(el).toHaveAttribute('data-density', 'compact');
    expect(el.className).toMatch(/overflow-hidden/);
  });

  it('supports row orientation', () => {
    render(
      <ViewportContainer orientation="row" data-testid="vp-row">
        x
      </ViewportContainer>,
    );
    expect(screen.getByTestId('vp-row').className).toMatch(/flex-row/);
  });
});

describe('BentoGrid', () => {
  it('defaults to 12-column grid', () => {
    const { container } = render(<BentoGrid>tile</BentoGrid>);
    const grid = container.firstChild as HTMLElement;
    expect(grid.className).toMatch(/grid-cols-12/);
  });
});

describe('BentoModule', () => {
  it('renders chrome border', () => {
    const { container } = render(<BentoModule>in</BentoModule>);
    expect((container.firstChild as HTMLElement).className).toMatch(/rounded-lg/);
  });
});
