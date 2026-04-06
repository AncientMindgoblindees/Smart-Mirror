import React from 'react';
import { Camera, Moon, Power, Check } from 'lucide-react';
import type { WidgetConfig } from '@/features/widgets/types';
import { getWidgetMetadata } from '@/features/widgets/registry';
import './tools-panel.css';

interface Props {
  onToggleCamera: () => void;
  onToggleDim: () => void;
  onToggleSleep: () => void;
  widgets: WidgetConfig[];
  onToggleWidget: (id: string) => void;
}

export const ToolsPanel: React.FC<Props> = ({
  onToggleCamera,
  onToggleDim,
  onToggleSleep,
  widgets,
  onToggleWidget,
}) => {
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
