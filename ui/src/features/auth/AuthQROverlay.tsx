import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { X } from 'lucide-react';
import type { PendingAuth } from './useAuthState';
import './auth-overlay.css';

type Props = {
  pendingAuth: PendingAuth | null;
  onCancel: () => void;
  autoDismissSeconds?: number;
};

export const AuthQROverlay: React.FC<Props> = ({ pendingAuth, onCancel, autoDismissSeconds = 30 }) => {
  const hasUserCode = Boolean(pendingAuth?.deviceCode.user_code?.trim());
  const onCancelRef = React.useRef(onCancel);
  onCancelRef.current = onCancel;
  const [secondsLeft, setSecondsLeft] = React.useState(autoDismissSeconds);

  React.useEffect(() => {
    if (!pendingAuth) return;
    const initial = Math.max(
      1,
      Math.min(
        Number.isFinite(pendingAuth.deviceCode.expires_in) ? pendingAuth.deviceCode.expires_in : autoDismissSeconds,
        autoDismissSeconds,
      ),
    );
    setSecondsLeft(initial);
    const intervalId = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(intervalId);
          void onCancelRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [pendingAuth, autoDismissSeconds]);

  React.useEffect(() => {
    if (!pendingAuth) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === 'Escape' || event.key === 'x' || event.key === 'X') {
        event.preventDefault();
        event.stopPropagation();
        void onCancelRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [pendingAuth]);

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
              Sign in with {pendingAuth.provider === 'google' ? 'Google' : pendingAuth.provider}
            </h2>

            <p className="auth-qr-instructions">
              {hasUserCode
                ? 'Scan this QR code with your phone, then enter the code below.'
                : 'Scan this QR code with your phone to open the sign-in page.'}
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

            {hasUserCode && (
              <div className="auth-qr-user-code">
                {pendingAuth.deviceCode.user_code}
              </div>
            )}

            <p className="auth-qr-url">
              Or visit: <span>{pendingAuth.deviceCode.verification_uri}</span>
            </p>

            <p className="auth-qr-waiting">Waiting for authorization... ({secondsLeft}s)</p>

            <button className="auth-qr-dismiss" onClick={onCancel} type="button">
              Dismiss
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
