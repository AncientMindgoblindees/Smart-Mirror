import type { LucideIcon } from 'lucide-react';

import './menu-overlay.css';

export type MenuItem = {
  id: string;
  label: string;
  icon: LucideIcon;
};

type MenuOverlayProps = {
  isOpen: boolean;
  activeIndex: number;
  items: MenuItem[];
};

export function MenuOverlay({ isOpen, activeIndex, items }: MenuOverlayProps) {
  if (!isOpen) return null;

  return (
    <div className="menu-overlay" role="dialog" aria-modal="true" aria-label="Mirror menu">
      <div className="menu-overlay__panel">
        <header className="menu-overlay__header">MIRROR MENU</header>

        <div className="menu-overlay__list" role="listbox" aria-activedescendant={`menu-item-${items[activeIndex]?.id ?? 'none'}`}>
          {items.map((item, index) => {
            const isActive = index === activeIndex;
            const Icon = item.icon;

            return (
              <div
                id={`menu-item-${item.id}`}
                key={item.id}
                className={`menu-overlay__tile${isActive ? ' is-active' : ''}`}
                role="option"
                aria-selected={isActive}
              >
                <span className="menu-overlay__tile-icon" aria-hidden="true">
                  <Icon size={18} strokeWidth={2.2} />
                </span>
                <span className="menu-overlay__tile-label">{item.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
