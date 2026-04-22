import { useCallback, useState } from 'react';

export function useAuthActions(
  initiateLogin: (
    provider: string,
    opts?: { targetUserId?: string; intent?: 'pair_profile' | 'create_account' },
  ) => Promise<void>,
  disconnectProvider: (provider: string) => Promise<void>,
) {
  const [authError, setAuthError] = useState<string | null>(null);

  const signInGoogle = useCallback(async (opts?: { targetUserId?: string; intent?: 'pair_profile' | 'create_account' }) => {
    setAuthError(null);
    try {
      await initiateLogin('google', opts);
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : 'Google sign-in failed');
    }
  }, [initiateLogin]);

  const disconnectGoogle = useCallback(async () => {
    setAuthError(null);
    await disconnectProvider('google');
  }, [disconnectProvider]);

  return {
    authError,
    setAuthError,
    signInGoogle,
    disconnectGoogle,
  };
}
