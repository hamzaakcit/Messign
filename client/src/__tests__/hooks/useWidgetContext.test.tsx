import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useWidgetContext } from '@/hooks/useWidgetContext';
import { useMissionControlFocusStore } from '@/stores/missionControlFocusStore';

function wrapper(path: string) {
  return function W({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>;
  };
}

describe('useWidgetContext', () => {
  beforeEach(() => {
    useMissionControlFocusStore.getState().setFocusedBentoKey(null);
  });

  it('resolves root path as dashboard module', () => {
    const { result } = renderHook(() => useWidgetContext('employee'), {
      wrapper: wrapper('/'),
    });
    expect(result.current.widgetContext.currentModule).toBe('dashboard');
  });

  it('exposes missionControlBento when store is set on dashboard', () => {
    useMissionControlFocusStore.getState().setFocusedBentoKey('dora');
    const { result } = renderHook(() => useWidgetContext('employee'), {
      wrapper: wrapper('/dashboard'),
    });
    expect(result.current.widgetContext.missionControlBento).toBe('dora');
  });

  it('does not expose missionControlBento on non-dashboard routes', () => {
    useMissionControlFocusStore.getState().setFocusedBentoKey('dora');
    const { result } = renderHook(() => useWidgetContext('employee'), {
      wrapper: wrapper('/chat'),
    });
    expect(result.current.widgetContext.missionControlBento).toBeUndefined();
  });
});
