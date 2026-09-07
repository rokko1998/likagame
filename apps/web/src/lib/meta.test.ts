import { describe, expect, it } from "vitest";
import {
  MAYAK_COLLECTIBLE_ID,
  claimDailyReward,
  createEmptyMetaProfile,
  grantAdventureFirstClear,
  hasDailyReward,
  localDayKey
} from "./meta";

describe("persistent demo meta profile", () => {
  it("grants one fixed daily spark and is idempotent for the same local day", () => {
    const now = new Date(2026, 8, 7, 10, 30);
    const first = claimDailyReward(createEmptyMetaProfile(), now);
    const duplicate = claimDailyReward(first.profile, new Date(2026, 8, 7, 23, 59));

    expect(localDayKey(now)).toBe("2026-09-07");
    expect(first.granted).toBe(true);
    expect(first.profile.balances.signal_sparks).toBe(1);
    expect(first.profile.gentle_streak.count).toBe(1);
    expect(hasDailyReward(first.profile, now)).toBe(true);
    expect(duplicate.granted).toBe(false);
    expect(duplicate.profile).toBe(first.profile);
  });

  it("continues the gentle streak after missed days and blocks clock rollback farming", () => {
    const first = claimDailyReward(createEmptyMetaProfile(), new Date(2026, 8, 1, 12));
    const later = claimDailyReward(first.profile, new Date(2026, 8, 7, 12));
    const rollback = claimDailyReward(later.profile, new Date(2026, 8, 3, 12));

    expect(later.profile.gentle_streak.count).toBe(2);
    expect(later.profile.balances.signal_sparks).toBe(2);
    expect(rollback.reason).toBe("clock_rollback");
    expect(rollback.profile).toBe(later.profile);
  });

  it("grants the adventure collectible only once, independently of run ids", () => {
    const first = grantAdventureFirstClear(createEmptyMetaProfile(), new Date("2026-09-07T12:00:00.000Z"));
    const duplicate = grantAdventureFirstClear(first.profile, new Date("2026-09-08T12:00:00.000Z"));

    expect(first.granted).toBe(true);
    expect(first.profile.collectibles[MAYAK_COLLECTIBLE_ID]).toBeDefined();
    expect(duplicate.granted).toBe(false);
    expect(Object.keys(duplicate.profile.collectibles)).toHaveLength(1);
  });
});
