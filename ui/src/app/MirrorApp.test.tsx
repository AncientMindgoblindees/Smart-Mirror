import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import MirrorApp from './MirrorApp';


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
      div: createMotionComponent('div'),
      span: createMotionComponent('span'),
    },
  };
});

vi.mock('@/features/widgets', () => ({
  DEV_PANEL_STORAGE_KEY: 'dev-panel',
  WidgetFrame: ({ config }: { config: { id: string } }) => <div>Widget {config.id}</div>,
  useWidgetPersistence: () => ({
    widgets: [{ id: 'clock', enabled: true }],
    setWidgets: vi.fn(),
  }),
}));

vi.mock('@/features/dev-panel', () => ({
  ToolsPanel: () => <div>Tools Panel</div>,
}));

vi.mock('@/features/camera', () => ({
  CameraOverlay: ({ errorMessage }: { errorMessage?: string | null }) => (
    <div>
      <span>Mock camera overlay</span>
      {errorMessage ? <span>{errorMessage}</span> : null}
    </div>
  ),
}));

vi.mock('@/features/connection', () => ({
  DeviceConnectionOverlay: () => <div>No companion connected</div>,
  useDeviceConnectionState: () => ({
    connectionState: {
      phase: 'idle',
      activeDevice: null,
      pendingDevice: null,
      errorMessage: null,
      errorCode: null,
    },
    handlers: {},
    retry: vi.fn(),
  }),
}));

vi.mock('@/features/auth', () => ({
  AuthQROverlay: () => null,
  useAuthState: () => ({
    providers: [],
    pendingAuth: null,
    initiateLogin: vi.fn(),
    cancelPendingAuth: vi.fn(),
    disconnectProvider: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock('@/hooks/useControlEvents', () => ({
  useControlEvents: () => {},
}));

vi.mock('@/hooks/useMirrorInput', () => ({
  useMirrorInput: () => {},
}));

vi.mock('@/hooks/useTimeOfDay', () => ({
  useTimeOfDay: () => {},
}));

vi.mock('@/hooks/useParallax', () => ({
  useParallax: () => ({ x: 0, y: 0 }),
}));

vi.mock('@/components/ui/Tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('./hooks/useMirrorDisplayMode', () => ({
  useMirrorDisplayMode: () => ({
    sleepMode: false,
    sleepModeRef: { current: false },
    toggleDim: vi.fn(),
    toggleSleep: vi.fn(),
  }),
}));

vi.mock('./hooks/useAuthActions', () => ({
  useAuthActions: () => ({
    authError: null,
    signInGoogle: vi.fn(),
    signInMicrosoft: vi.fn(),
    disconnectGoogle: vi.fn(),
    disconnectMicrosoft: vi.fn(),
  }),
}));

vi.mock('./hooks/useOverlayState', () => ({
  useOverlayState: () => ({
    showCamera: true,
    setShowCamera: vi.fn(),
    cameraError: 'Camera blocked by another process',
    setCameraError: vi.fn(),
  }),
}));

vi.mock('@/config/backendOrigin', () => ({
  getApiBase: () => 'http://mirror.test/api',
}));


describe('MirrorApp', () => {
  it('renders the mirror display with widget and camera state', () => {
    render(<MirrorApp />);

    expect(screen.getByText('Widget clock')).toBeInTheDocument();
    expect(screen.getByText('Mock camera overlay')).toBeInTheDocument();
    expect(screen.getByText('Camera blocked by another process')).toBeInTheDocument();
    expect(screen.getByText('No companion connected')).toBeInTheDocument();
  });
});
