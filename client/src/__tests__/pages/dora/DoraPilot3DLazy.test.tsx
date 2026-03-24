import { render, screen } from '@testing-library/react';

/**
 * jsdom has no WebGL, so the lazy <Canvas> will never mount. This test
 * verifies that the Suspense fallback renders cleanly and the component
 * doesn't blow up during SSR / non-WebGL environments.
 */
describe('DoraPilot3DLazy', () => {
  it('renders the loading fallback in a non-WebGL environment', async () => {
    const { DoraPilot3DLazy } = await import(
      '@/components/dora/pilot/DoraPilot3DLazy'
    );
    render(<DoraPilot3DLazy width={200} height={200} />);
    expect(screen.getByText(/loading 3d/i)).toBeInTheDocument();
  });
});
