import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  MirrorProfile,
  MirrorRegistrationResponse,
  MirrorSyncResponse,
  SessionActiveProfile,
  SessionMeResponse,
} from '@/api/backendTypes';
import {
  activateProfile,
  deleteProfile,
  enrollProfile,
  getMirrorSync,
  getSessionMe,
  listProfiles,
  registerMirror,
} from '@/api/mirrorApi';
import {
  readMirrorHardwareId,
  readMirrorHardwareToken,
  saveActiveMirrorUserId,
  saveMirrorHardwareId,
  saveMirrorHardwareToken,
} from '@/api/deviceIdentity';

type MirrorSummary = MirrorRegistrationResponse | {
  id: string;
  hardware_id: string;
  friendly_name?: string | null;
  created_at: string;
  updated_at: string;
};

type RefreshSnapshot = {
  activeProfile: MirrorProfile | null;
  session: SessionMeResponse | null;
  mismatch: boolean;
  mirrorReady: boolean;
  syncError: unknown;
};

function slugifyProfileId(displayName: string, existingUserIds: string[]): string {
  const base = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'profile';
  if (!existingUserIds.includes(base)) return base;
  let suffix = 2;
  while (existingUserIds.includes(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

function toErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.trim()) {
    const message = err.message.trim();
    if (/401|auth required|invalid firebase|not authenticated/i.test(message)) {
      return 'Session is not signed in yet. Complete QR pairing to load your active profile.';
    }
    return message;
  }
  return fallback;
}

function shouldRegisterMirror(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof Error) {
    const message = err.message.trim();
    return /401|403|404|not found|unknown hardware|hardware token|mirror.*register|unregistered/i.test(message);
  }
  return false;
}

function mapSessionProfile(activeProfile: SessionActiveProfile, mirrorId: string): MirrorProfile {
  const nowIso = new Date().toISOString();
  return {
    id: -1,
    mirror_id: mirrorId,
    user_id: activeProfile.user_uid,
    display_name: activeProfile.display_name ?? null,
    email: activeProfile.email ?? null,
    photo_url: activeProfile.photo_url ?? null,
    widget_config: null,
    is_active: Boolean(activeProfile.is_active),
    created_at: nowIso,
    updated_at: nowIso,
  };
}

function mergeProfiles(list: MirrorProfile[]): MirrorProfile[] {
  const map = new Map<string, MirrorProfile>();
  list.forEach((profile) => {
    const existing = map.get(profile.user_id);
    if (!existing) {
      map.set(profile.user_id, profile);
      return;
    }
    map.set(profile.user_id, {
      ...existing,
      ...profile,
      display_name: profile.display_name ?? existing.display_name ?? null,
      email: profile.email ?? existing.email ?? null,
      photo_url: profile.photo_url ?? existing.photo_url ?? null,
      is_active: profile.is_active || existing.is_active,
    });
  });
  return Array.from(map.values());
}

export function useMirrorSession() {
  const [mirror, setMirror] = useState<MirrorSummary | null>(null);
  const [profiles, setProfiles] = useState<MirrorProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<MirrorProfile | null>(null);
  const [mirrorSyncSnapshot, setMirrorSyncSnapshot] = useState<MirrorSyncResponse | null>(null);
  const [sessionMe, setSessionMe] = useState<SessionMeResponse | null>(null);
  const [sessionMismatch, setSessionMismatch] = useState(false);
  const [sessionMismatchMessage, setSessionMismatchMessage] = useState<string | null>(null);
  const [sessionProfileReady, setSessionProfileReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hardwareId = useMemo(() => readMirrorHardwareId(), []);

  const refreshSessionState = useCallback(
    async (opts?: { includeProfileList?: boolean; registration?: MirrorSummary | null }): Promise<RefreshSnapshot> => {
      const includeProfileList = Boolean(opts?.includeProfileList);
      const registration = opts?.registration ?? mirror;
      const fallbackMirrorId = registration?.id ?? hardwareId;

      const [sessionResult, syncResult, profileResult] = await Promise.allSettled([
        getSessionMe(),
        getMirrorSync(),
        includeProfileList ? listProfiles() : Promise.resolve([] as MirrorProfile[]),
      ]);

      const sessionPayload = sessionResult.status === 'fulfilled' ? sessionResult.value : null;
      const syncPayload = syncResult.status === 'fulfilled' ? syncResult.value : null;
      const syncError = syncResult.status === 'rejected' ? syncResult.reason : null;
      const profileList = profileResult.status === 'fulfilled' ? profileResult.value : [];

      const sessionActive = sessionPayload?.active_profile
        ? mapSessionProfile(sessionPayload.active_profile, syncPayload?.mirror.id ?? fallbackMirrorId)
        : null;
      const fallbackActive = syncPayload?.active_profile ?? profileList.find((profile) => profile.is_active) ?? null;
      const resolvedActiveProfile = sessionActive ?? fallbackActive;

      const resolvedProfiles = mergeProfiles([
        ...profileList,
        ...(syncPayload?.active_profile ? [syncPayload.active_profile] : []),
        ...(sessionActive ? [sessionActive] : []),
      ]);

      const mismatch =
        Boolean(sessionPayload?.user?.uid) &&
        Boolean(resolvedActiveProfile?.user_id) &&
        sessionPayload?.user?.uid !== resolvedActiveProfile?.user_id;

      setSessionMe(sessionPayload);
      setMirrorSyncSnapshot(syncPayload);
      if (syncPayload?.mirror) {
        setMirror(syncPayload.mirror);
      } else if (registration) {
        setMirror(registration);
      }
      setProfiles(resolvedProfiles);
      setActiveProfile(resolvedActiveProfile);
      setSessionProfileReady(Boolean(sessionPayload?.active_profile?.is_active));
      setSessionMismatch(mismatch);
      setSessionMismatchMessage(
        mismatch
          ? `Authenticated user (${sessionPayload?.user?.uid}) does not match active mirror profile (${resolvedActiveProfile?.user_id}).`
          : null,
      );
      saveActiveMirrorUserId(resolvedActiveProfile?.user_id ?? null);

      if (sessionResult.status === 'rejected') {
        setError(toErrorMessage(sessionResult.reason, 'Failed to load /session/me.'));
      } else {
        setError(null);
      }

      return {
        activeProfile: resolvedActiveProfile,
        session: sessionPayload,
        mismatch,
        mirrorReady: Boolean(syncPayload?.mirror ?? registration),
        syncError,
      };
    },
    [hardwareId, mirror],
  );

  const ensureMirrorRegistration = useCallback(async () => {
    saveMirrorHardwareId(hardwareId);
    const friendlyName = import.meta.env.VITE_MIRROR_FRIENDLY_NAME?.trim() || 'Shared Smart Mirror';
    const registration = await registerMirror({
      hardware_id: hardwareId,
      friendly_name: friendlyName,
    });
    saveMirrorHardwareToken(registration.hardware_token);
    setMirror(registration);
    return registration;
  }, [hardwareId]);

  const refresh = useCallback(async () => {
    saveMirrorHardwareId(hardwareId);
    const snapshot = await refreshSessionState({ includeProfileList: true });
    if (snapshot.mirrorReady) return;

    const hasStoredToken = Boolean(readMirrorHardwareToken());
    const needsRegistration = !hasStoredToken || shouldRegisterMirror(snapshot.syncError);
    if (!needsRegistration) return;

    const registration = await ensureMirrorRegistration();
    await refreshSessionState({ includeProfileList: true, registration });
  }, [ensureMirrorRegistration, hardwareId, refreshSessionState]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        await refresh();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to prepare the mirror session.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const waitForActiveProfile = useCallback(
    async (opts?: { expectedUserUid?: string | null; timeoutMs?: number; intervalMs?: number }) => {
      const expectedUserUid = opts?.expectedUserUid?.trim() || null;
      const timeoutMs = opts?.timeoutMs ?? 25_000;
      const intervalMs = opts?.intervalMs ?? 1_500;
      const deadline = Date.now() + timeoutMs;

      let latest = await refreshSessionState();
      while (Date.now() < deadline) {
        const activeUid = latest.activeProfile?.user_id ?? null;
        const matches = activeUid && (!expectedUserUid || activeUid === expectedUserUid);
        if (matches) return latest.activeProfile;
        await new Promise<void>((resolve) => {
          window.setTimeout(() => resolve(), intervalMs);
        });
        latest = await refreshSessionState();
      }
      return latest.activeProfile;
    },
    [refreshSessionState],
  );

  const activateUser = useCallback(
    async (userId: string) => {
      const profile = await activateProfile({
        hardware_id: hardwareId,
        target_user_id: userId,
      });
      saveActiveMirrorUserId(profile.user_id);
      await refresh();
      return profile;
    },
    [hardwareId, refresh],
  );

  const createProfile = useCallback(
    async (displayName: string) => {
      const trimmed = displayName.trim();
      if (!trimmed) {
        throw new Error('Enter a profile name before creating it.');
      }
      const userId = slugifyProfileId(trimmed, profiles.map((profile) => profile.user_id));
      const profile = await enrollProfile({
        hardware_id: hardwareId,
        user_id: userId,
        display_name: trimmed,
        activate: true,
      });
      saveActiveMirrorUserId(profile.user_id);
      await refresh();
      return profile;
    },
    [hardwareId, profiles, refresh],
  );

  const removeProfile = useCallback(
    async (userId: string) => {
      await deleteProfile(userId);
      await refresh();
    },
    [refresh],
  );

  return {
    hardwareId,
    mirror,
    profiles,
    activeProfile,
    sessionMe,
    sessionMismatch,
    sessionMismatchMessage,
    sessionProfileReady,
    mirrorSyncSnapshot,
    loading,
    error,
    refresh,
    waitForActiveProfile,
    activateUser,
    createProfile,
    removeProfile,
  };
}
