import React from 'react';
import { WidgetConfig } from '../types';
import { getWidgetMetadata } from '../registry';
import { Camera, Moon, Power, Check } from 'lucide-react';

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
      <div className="tools-header">TOOLS</div>

      <div className="tools-section">
        <p className="tools-shortcuts" aria-label="Keyboard shortcuts">
          Keys: <kbd>d</kbd> panel · <kbd>2</kbd> dim · <kbd>3</kbd> sleep
        </p>
        <div className="button-group">
          <button type="button" className="tool-btn" onClick={onToggleCamera}>
            <Camera size={18} /> Camera Feed
          </button>
          <button type="button" className="tool-btn" onClick={onToggleDim}>
            <Moon size={18} /> Dim display
          </button>
          <button type="button" className="tool-btn" onClick={onToggleSleep}>
            <Power size={18} /> Screen off (sleep)
          </button>
        </div>
      </div>

      <div className="tools-section">
        <div className="section-label">WIDGETS</div>
        <div className="widget-list">
          {widgets.map((w) => {
            const meta = getWidgetMetadata(w.type);
            const label = meta?.title ?? w.type;
            return (
              <button
                key={w.id}
                type="button"
                className={`widget-toggle ${w.enabled ? 'active' : ''}`}
                onClick={() => onToggleWidget(w.id)}
              >
                {label}
                {w.enabled && <Check size={14} />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
