export const META_PROFILE_KEY = "likagame_meta_profile_v1";
export const MAYAK_COLLECTIBLE_ID = "collectible.mayak7_beacon_core.v1";
export const MAYAK_ADVENTURE_ID = "adventure.mayak7.v1";

export type MetaGrant = {
  idempotency_key: string;
  kind: "daily" | "adventure_first_clear";
  committed_at: string;
  payload: {
    signal_sparks?: number;
    collectible_id?: string;
  };
};

export type MetaProfile = {
  schema_version: 1;
  balances: {
    signal_sparks: number;
  };
  gentle_streak: {
    count: number;
    last_claim_day: string | null;
    max_seen_day: string | null;
  };
  collectibles: Record<string, {
    unlocked_at: string;
    source_grant_id: string;
  }>;
  grants: Record<string, MetaGrant>;
};

export type GrantResult = {
  profile: MetaProfile;
  granted: boolean;
  reason: "granted" | "already_granted" | "clock_rollback";
};

export function createEmptyMetaProfile(): MetaProfile {
  return {
    schema_version: 1,
    balances: { signal_sparks: 0 },
    gentle_streak: { count: 0, last_claim_day: null, max_seen_day: null },
    collectibles: {},
    grants: {}
  };
}

function looksLikeMetaProfile(value: unknown): value is MetaProfile {
  if (!value || typeof value !== "object") return false;
  const profile = value as Partial<MetaProfile>;
  return (
    profile.schema_version === 1 &&
    typeof profile.balances?.signal_sparks === "number" &&
    typeof profile.gentle_streak?.count === "number" &&
    Boolean(profile.collectibles) &&
    Boolean(profile.grants)
  );
}

export function localDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dailyGrantKey(date: Date): string {
  return `daily:${localDayKey(date)}`;
}

export function hasDailyReward(profile: MetaProfile, date: Date): boolean {
  return Boolean(profile.grants[dailyGrantKey(date)]);
}

export function claimDailyReward(profile: MetaProfile, date: Date = new Date()): GrantResult {
  const day = localDayKey(date);
  const idempotencyKey = `daily:${day}`;
  if (profile.grants[idempotencyKey]) return { profile, granted: false, reason: "already_granted" };
  if (profile.gentle_streak.max_seen_day && day < profile.gentle_streak.max_seen_day) {
    return { profile, granted: false, reason: "clock_rollback" };
  }

  const grant: MetaGrant = {
    idempotency_key: idempotencyKey,
    kind: "daily",
    committed_at: date.toISOString(),
    payload: { signal_sparks: 1 }
  };
  return {
    granted: true,
    reason: "granted",
    profile: {
      ...profile,
      balances: { signal_sparks: profile.balances.signal_sparks + 1 },
      gentle_streak: {
        count: profile.gentle_streak.count + 1,
        last_claim_day: day,
        max_seen_day: day
      },
      grants: { ...profile.grants, [idempotencyKey]: grant }
    }
  };
}

export function grantAdventureFirstClear(
  profile: MetaProfile,
  date: Date = new Date(),
  adventureId = MAYAK_ADVENTURE_ID
): GrantResult {
  const idempotencyKey = `adventure-first-clear:${adventureId}`;
  if (profile.grants[idempotencyKey]) return { profile, granted: false, reason: "already_granted" };

  const committedAt = date.toISOString();
  const grant: MetaGrant = {
    idempotency_key: idempotencyKey,
    kind: "adventure_first_clear",
    committed_at: committedAt,
    payload: { collectible_id: MAYAK_COLLECTIBLE_ID }
  };
  return {
    granted: true,
    reason: "granted",
    profile: {
      ...profile,
      collectibles: {
        ...profile.collectibles,
        [MAYAK_COLLECTIBLE_ID]: { unlocked_at: committedAt, source_grant_id: idempotencyKey }
      },
      grants: { ...profile.grants, [idempotencyKey]: grant }
    }
  };
}

export function loadMetaProfile(): MetaProfile {
  try {
    const raw = localStorage.getItem(META_PROFILE_KEY);
    if (!raw) return createEmptyMetaProfile();
    const value: unknown = JSON.parse(raw);
    return looksLikeMetaProfile(value) ? value : createEmptyMetaProfile();
  } catch {
    return createEmptyMetaProfile();
  }
}

export function saveMetaProfile(profile: MetaProfile): void {
  try {
    localStorage.setItem(META_PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // A hardened webview may reject storage; the in-memory profile remains usable.
  }
}
