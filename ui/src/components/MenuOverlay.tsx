import type { LucideIcon } from 'lucide-react';
import type { MenuNavigationLayer } from '@/hooks/useMenuNavigation';
import { WidgetFrame, type WidgetConfig } from '@/features/widgets';
import { shouldShowMenuPreviewInLiteMode } from '@/app/performanceMode';

import './menu-overlay.css';

export type MenuMainItem = {
  id: string;
  label: string;
  icon: LucideIcon;
};

export type MenuOverlayItem = {
  id: string;
  label: string;
  icon?: LucideIcon;
  hint?: string;
  kind?: 'option' | 'back';
  imageUrl?: string;
  selected?: boolean;
};

export type MenuPreviewState = {
  title: string;
  lines: Array<{ key: string; value: string }>;
  widget?: WidgetConfig | null;
};

type MenuOverlayProps = {
  isOpen: boolean;
  layer: MenuNavigationLayer;
  title: string;
  activeIndex: number;
  items: MenuOverlayItem[];
  preview?: MenuPreviewState | null;
  previewWidgetThemeId?: string;
  previewBackgroundThemeId?: string;
  compactTopRight?: boolean;
  performanceLiteMode?: boolean;
};

export function MenuOverlay({
  isOpen,
  layer,
  title,
  activeIndex,
  items,
  preview,
  previewWidgetThemeId,
  previewBackgroundThemeId,
  compactTopRight = false,
  performanceLiteMode = false,
}: MenuOverlayProps) {
  if (!isOpen) return null;

  const showPreview = layer !== 'main' && Boolean(preview) && (!performanceLiteMode || shouldShowMenuPreviewInLiteMode(layer));
  const previewRect = new DOMRect(0, 0, 360, 252);

  return (
    <div
      className={`menu-overlay${compactTopRight ? ' is-compact-top-right' : ''}${performanceLiteMode ? ' performance-lite' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Mirror menu"
    >
      <div className={`menu-overlay__layout${showPreview ? ' has-preview' : ''}`}>
        <div className="menu-overlay__panel">
          <header className="menu-overlay__header">{title}</header>

          <div className="menu-overlay__list" role="listbox" aria-activedescendant={`menu-item-${items[activeIndex]?.id ?? 'none'}`}>
            {items.map((item, index) => {
              const isActive = index === activeIndex;
              const Icon = item.icon;
              const tileClass = item.kind === 'back' ? ' menu-overlay__tile--back' : '';

              return (
                <div
                  id={`menu-item-${item.id}`}
                  key={item.id}
                  className={`menu-overlay__tile${tileClass}${isActive ? ' is-active' : ''}${item.selected ? ' is-selected' : ''}`}
                  role="option"
                  aria-selected={isActive}
                >
                  {item.imageUrl ? (
                    <span className="menu-overlay__tile-thumb" aria-hidden="true">
                      <img src={item.imageUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                    </span>
                  ) : null}
                  {Icon ? (
                    <span className="menu-overlay__tile-icon" aria-hidden="true">
                      <Icon size={18} strokeWidth={2.2} />
                    </span>
                  ) : null}
                  <span className="menu-overlay__tile-body">
                    <span className="menu-overlay__tile-label">{item.label}</span>
                    {item.hint ? <span className="menu-overlay__tile-hint">{item.hint}</span> : null}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {showPreview ? (
          <aside
            className="menu-overlay__preview menu-overlay__preview-themed"
            data-widget-theme={previewWidgetThemeId}
            data-background-theme={previewBackgroundThemeId}
            aria-live="polite"
            aria-label="Widget preview"
          >
            <div className="menu-overlay__preview-title">{preview?.title}</div>
            <div className="menu-overlay__preview-widget">
              {preview?.widget ? (
                <div className="menu-overlay__preview-canvas">
                  <WidgetFrame config={preview.widget} canvasRect={previewRect} disableAnimations={performanceLiteMode} />
                </div>
              ) : (
                <div className="menu-overlay__preview-empty">No widget selected.</div>
              )}
            </div>
            <div className="menu-overlay__preview-card">
              {preview?.lines.length ? (
                preview.lines.map((line) => (
                  <div key={line.key} className="menu-overlay__preview-row">
                    <span>{line.key}</span>
                    <span>{line.value}</span>
                  </div>
                ))
              ) : (
                <div className="menu-overlay__preview-empty">No configurable parameters.</div>
              )}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
