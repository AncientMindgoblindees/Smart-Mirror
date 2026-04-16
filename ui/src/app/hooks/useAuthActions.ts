import { useCallback, useState } from 'react';

export function useAuthActions(
  initiateLogin: (provider: string) => Promise<void>,
  disconnectProvider: (provider: string) => Promise<void>,
) {
  const [authError, setAuthError] = useState<string | null>(null);

  const signIn = useCallback(
    async (provider: 'google' | 'microsoft') => {
      setAuthError(null);
      try {
        await initiateLogin(provider);
      } catch (e) {
        const label = provider === 'google' ? 'Google' : 'Microsoft';
        setAuthError(e instanceof Error ? e.message : `${label} sign-in failed`);
      }
    },
    [initiateLogin],
  );

  const disconnect = useCallback(
    async (provider: 'google' | 'microsoft') => {
      setAuthError(null);
      await disconnectProvider(provider);
    },
    [disconnectProvider],
  );

  return {
    authError,
    setAuthError,
    signInGoogle: () => signIn('google'),
    signInMicrosoft: () => signIn('microsoft'),
    disconnectGoogle: () => disconnect('google'),
    disconnectMicrosoft: () => disconnect('microsoft'),
  };
}
