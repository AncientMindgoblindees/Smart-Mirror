import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DeviceConnectionOverlay } from './DeviceConnectionOverlay';
import type { ConnectionState } from './useDeviceConnectionState';


vi.mock('motion/react', () => {
  const createMotionComponent = (tag: string) =>
    React.forwardRef(
      (
        { children, ...props }: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode },
        ref,
      ) => React.createElement(tag, { ...props, ref }, children),
    );

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion: {
      button: createMotionComponent('button'),
      circle: createMotionComponent('circle'),
      div: createMotionComponent('div'),
      path: createMotionComponent('path'),
    },
  };
});

vi.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}));

vi.mock('@/hooks/useParallax', () => ({
  useParallax: () => ({ x: 0, y: 0 }),
}));

vi.mock('@/components/ui/morphing-square', () => ({
  MorphingSquare: ({ 'aria-label': ariaLabel }: { 'aria-label'?: string }) => (
    <div aria-label={ariaLabel}>morphing-square</div>
  ),
}));


function makeState(overrides: Partial<ConnectionState> = {}): ConnectionState {
  return {
    phase: 'idle',
    activeDevice: null,
    pendingDevice: null,
    errorMessage: null,
    errorCode: null,
    ...overrides,
  };
}


describe('DeviceConnectionOverlay', () => {
  it('renders the idle companion status pill', () => {
    render(<DeviceConnectionOverlay state={makeState()} />);

    expect(screen.getByText('No companion connected')).toBeInTheDocument();
  });

  it('renders retry details for error states', () => {
    const onRetry = vi.fn();

    render(
      <DeviceConnectionOverlay
        state={makeState({
          phase: 'error',
          errorMessage: 'Could not reach pairing service',
        })}
        onRetry={onRetry}
      />,
    );

    expect(screen.getAllByText('Connection failed').length).toBeGreaterThan(0);
    expect(screen.getByText('Could not reach pairing service')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
