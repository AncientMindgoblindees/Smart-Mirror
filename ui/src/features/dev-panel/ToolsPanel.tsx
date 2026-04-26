import React, { useState } from 'react';
import { Camera, Moon, Power, Check } from 'lucide-react';
import type { WidgetConfig } from '@/features/widgets/types';
import { getWidgetMetadata } from '@/features/widgets/registry';
import type { ProviderStatus } from '@/features/auth/useAuthState';
import './tools-panel.css';

interface Props {
  onToggleCamera: () => void;
  onToggleDim: () => void;
  onToggleSleep: () => void;
  widgets: WidgetConfig[];
  onToggleWidget: (id: string) => void;
  /** Calendar OAuth (device code -> QR on mirror) */
  authProviders?: ProviderStatus[];
  authPending?: boolean;
  authError?: string | null;
  onSignInGoogle?: () => void | Promise<void>;
  onDisconnectGoogle?: () => void | Promise<void>;
}

export const ToolsPanel: React.FC<Props> = ({
  onToggleCamera,
  onToggleDim,
  onToggleSleep,
  widgets,
  onToggleWidget,
  authProviders = [],
  authPending = false,
  authError = null,
  onSignInGoogle,
  onDisconnectGoogle,
}) => {
  const [authBusy, setAuthBusy] = useState(false);
  const google = authProviders.find((p) => p.provider === 'google');
  const googleConnected = google?.connected ?? false;

  const run = async (fn?: () => void | Promise<void>) => {
    if (!fn || authBusy || authPending) return;
    setAuthBusy(true);
    try {
      await fn();
    } finally {
      setAuthBusy(false);
    }
  };

  return (
    <div className="tools-panel frosted" data-dev-panel>
      <div className="tools-section">
        <div className="button-group">
          <button type="button" className="tool-btn icon-only" onClick={onToggleCamera} aria-label="Camera feed">
            <Camera size={18} />
          </button>
          <button type="button" className="tool-btn icon-only" onClick={onToggleDim} aria-label="Dim display">
            <Moon size={18} />
          </button>
          <button
            type="button"
            className="tool-btn icon-only"
            onClick={onToggleSleep}
            aria-label="Toggle sleep"
          >
            <Power size={18} />
          </button>
        </div>
      </div>

      {onSignInGoogle && (
        <div className="tools-section tools-accounts">
          <div className="tools-account-label">Calendar</div>
          <div className="tools-account-row">
            <button
              type="button"
              className="tool-btn tool-btn-account"
              disabled={authBusy || authPending || googleConnected}
              onClick={() => run(onSignInGoogle)}
            >
              {googleConnected ? 'Google Connected' : 'Google'}
            </button>
            {googleConnected && onDisconnectGoogle && (
              <button
                type="button"
                className="tool-btn tool-btn-account tool-btn-disconnect"
                disabled={authBusy}
                onClick={() => run(onDisconnectGoogle)}
              >
                Out
              </button>
            )}
          </div>
          {authError && <p className="tools-auth-error">{authError}</p>}
        </div>
      )}

      <div className="tools-section">
        <div className="widget-list">
          {widgets.map((w) => {
            const meta = getWidgetMetadata(w.type);
            const label = meta?.title ?? w.type;
            return (
              <button
                key={w.id}
                type="button"
                className={`widget-toggle icon-only ${w.enabled ? 'active' : ''}`}
                onClick={() => onToggleWidget(w.id)}
                aria-label={label}
              >
                <Check size={14} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
