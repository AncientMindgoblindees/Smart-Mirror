import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import type { WidgetConfig } from '../types';

export const TextPanelWidget: React.FC<{ config: WidgetConfig }> = ({ config }) => {
  const [displayText, setDisplayText] = useState('');
  const fullText = config.text ?? '';

  useEffect(() => {
    if (!fullText) {
      setDisplayText('');
      return;
    }
    setDisplayText('');
    let i = 0;
    const id = setInterval(() => {
      i++;
      setDisplayText(fullText.slice(0, i));
      if (i >= fullText.length) clearInterval(id);
    }, 28);
    return () => clearInterval(id);
  }, [fullText]);

  return (
    <div className="widget-content">
      {config.title && (
        <motion.p
          style={{
            fontWeight: 600,
            marginBottom: '0.4em',
            fontFamily: 'var(--font-display)',
            fontSize: '1.05em',
            color: 'var(--color-text-primary)',
            letterSpacing: '-0.01em',
          }}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          {config.title}
        </motion.p>
      )}
      {fullText && (
        <motion.p
          style={{
            color: 'var(--color-text-secondary)',
            whiteSpace: 'pre-wrap',
            fontSize: '0.95em',
            lineHeight: '1.5',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.4 }}
        >
          {displayText}
          {displayText.length < fullText.length && (
            <span style={{ opacity: 0.5, animation: 'colonPulse 1s ease-in-out infinite' }}>|</span>
          )}
        </motion.p>
      )}
    </div>
  );
};
