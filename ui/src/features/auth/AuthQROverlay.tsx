import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { X } from 'lucide-react';
import type { PendingAuth } from './useAuthState';
import './auth-overlay.css';

type Props = {
  pendingAuth: PendingAuth | null;
  onCancel: () => void;
};

export const AuthQROverlay: React.FC<Props> = ({ pendingAuth, onCancel }) => {
  return (
    <AnimatePresence>
      {pendingAuth && (
        <motion.div
          className="auth-qr-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <motion.div
            className="auth-qr-card"
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            <button className="auth-qr-close" onClick={onCancel} aria-label="Cancel">
              <X size={24} />
            </button>

            <h2 className="auth-qr-title">
              Sign in with {pendingAuth.provider === 'google' ? 'Google' : 'Microsoft'}
            </h2>

            <p className="auth-qr-instructions">
              Scan this QR code with your phone, then enter the code below.
            </p>

            <div className="auth-qr-code-wrapper">
              <QRCodeSVG
                value={pendingAuth.deviceCode.verification_uri}
                size={200}
                bgColor="transparent"
                fgColor="#ffffff"
                level="M"
              />
            </div>

            <div className="auth-qr-user-code">
              {pendingAuth.deviceCode.user_code}
            </div>

            <p className="auth-qr-url">
              Or visit: <span>{pendingAuth.deviceCode.verification_uri}</span>
            </p>

            <p className="auth-qr-waiting">Waiting for authorization...</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
