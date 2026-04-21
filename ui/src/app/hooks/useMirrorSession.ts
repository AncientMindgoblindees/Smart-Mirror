import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MirrorProfile, MirrorRegistrationResponse } from '@/api/backendTypes';
import {
  activateProfile,
  deleteProfile,
  enrollProfile,
  getMirrorSync,
  listProfiles,
  registerMirror,
} from '@/api/mirrorApi';
import {
  readMirrorHardwareId,
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

export function useMirrorSession() {
  const [mirror, setMirror] = useState<MirrorSummary | null>(null);
  const [profiles, setProfiles] = useState<MirrorProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<MirrorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hardwareId = useMemo(() => readMirrorHardwareId(), []);

  const refresh = useCallback(async () => {
    saveMirrorHardwareId(hardwareId);
    const friendlyName = import.meta.env.VITE_MIRROR_FRIENDLY_NAME?.trim() || 'Shared Smart Mirror';
    const registration = await registerMirror({
      hardware_id: hardwareId,
      friendly_name: friendlyName,
    });
    saveMirrorHardwareToken(registration.hardware_token);
    setMirror(registration);

    const profileList = await listProfiles();
    setProfiles(profileList);

    try {
      const sync = await getMirrorSync();
      setMirror(sync.mirror);
      setActiveProfile(sync.active_profile ?? null);
      saveActiveMirrorUserId(sync.active_profile?.user_id ?? null);
      setProfiles((current) => {
        if (current.length > 0) return current;
        return sync.active_profile ? [sync.active_profile] : current;
      });
    } catch {
      const selected = profileList.find((profile) => profile.is_active) ?? null;
      setActiveProfile(selected);
      saveActiveMirrorUserId(selected?.user_id ?? null);
    }
  }, [hardwareId]);

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
    loading,
    error,
    refresh,
    activateUser,
    createProfile,
    removeProfile,
  };
}
