import React from 'react';
import { AnimatePresence, motion } from 'motion/react';

import type { WidgetConfig } from '../types';
import { estimatePageSize, useDisplayPagination } from '../useDisplayPagination';
import { useEmailMessages } from './useEmailMessages';
import type { EmailDisplay } from './useEmailMessages';
import './email-widget.css';

const PAGE_SIZE_CAP_BY_PRESET = {
  small: 3,
  medium: 5,
  large: 6,
} as const;

function resolveEmailPageSize(config: WidgetConfig): number {
  const base = estimatePageSize(config.freeform.width, config.freeform.height);
  const preset = config.freeform.sizePreset;
  if (!preset) return base;
  return Math.min(base, PAGE_SIZE_CAP_BY_PRESET[preset]);
}

export const EmailWidget: React.FC<{ config: WidgetConfig }> = React.memo(({ config }) => {
  const { messages, hasProviders, loading } = useEmailMessages();
  const pageSize = resolveEmailPageSize(config);
  const { pageItems, pageIndex, pageCount } = useDisplayPagination<EmailDisplay>(messages, pageSize, 7000);

  if (!loading && messages.length === 0 && hasProviders) {
    return (
      <div className="widget-content email-widget">
        <div className="email-empty">No unread or high-priority emails</div>
      </div>
    );
  }

  if (!loading && !hasProviders) {
    return (
      <div className="widget-content email-widget">
        <div className="email-empty">Connect Google or Microsoft email</div>
      </div>
    );
  }

  return (
    <div className="widget-content email-widget">
      <AnimatePresence mode="wait">
        <motion.div
          key={pageIndex}
          className="email-page"
          data-count={Math.max(1, pageItems.length)}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          {pageItems.map((item, idx) => (
            <motion.div
              className={`email-item ${item.highPriority ? 'email-item-priority' : ''}`}
              key={`${item.sender}-${item.subject}-${idx}`}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                delay: idx * 0.05,
                type: 'spring',
                stiffness: 300,
                damping: 28,
              }}
            >
              <div className="email-line-top">
                <span className="email-sender">{item.sender}</span>
                <span className="email-received">{item.receivedLabel}</span>
              </div>
              <div className="email-line-bottom">
                <span className="email-subject">{item.subject}</span>
                <span className="email-tags">
                  {item.unread && <span className="email-tag email-tag-unread">Unread</span>}
                  {item.highPriority && <span className="email-tag email-tag-priority">High</span>}
                  <span className="email-tag email-tag-source">{item.source}</span>
                </span>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </AnimatePresence>

      {pageCount > 1 && (
        <div className="pager-dots" aria-hidden="true">
          {Array.from({ length: pageCount }).map((_, i) => (
            <span key={i} className={`pager-dot ${i === pageIndex ? 'active' : ''}`} />
          ))}
        </div>
      )}
    </div>
  );
});

EmailWidget.displayName = 'EmailWidget';
