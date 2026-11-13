import { describe, expect, it } from "vitest";
import { statusFromCompare, updateBlockedReason } from "@/lib/app-update";

const sha = (c: string) => c.repeat(40);
const commit = (c: string, message: string) => ({ sha: sha(c), commit: { message } });

describe("statusFromCompare", () => {
  it("is up to date when dev has nothing new (button greyed out)", () => {
    const status = statusFromCompare({ ahead_by: 0, behind_by: 0, commits: [] }, sha("a"));
    expect(status).toEqual({ state: "up_to_date" });
    expect(updateBlockedReason(status)).toMatch(/already matches dev/);
  });

  it("offers the update when dev is ahead, newest change first, first line only", () => {
    const status = statusFromCompare(
      { ahead_by: 2, behind_by: 0, commits: [commit("a", "Older"), commit("b", "Newer\n\nDetails")] },
      sha("b"),
    );
    expect(status).toEqual({
      state: "update_available",
      devSha: sha("b"),
      count: 2,
      changes: [
        { sha: sha("b"), summary: "Newer" },
        { sha: sha("a"), summary: "Older" },
      ],
    });
    expect(updateBlockedReason(status)).toBeNull();
  });

  it("hides the change list when GitHub's list doesn't reach the newest commit", () => {
    const status = statusFromCompare({ ahead_by: 300, behind_by: 0, commits: [commit("a", "Old")] }, sha("b"));
    expect(status).toMatchObject({ state: "update_available", count: 300, changes: [] });
  });

  it("blocks the update when live has changes dev doesn't", () => {
    const status = statusFromCompare({ ahead_by: 1, behind_by: 2, commits: [commit("a", "x")] }, sha("a"));
    expect(status).toEqual({ state: "diverged", liveOnly: 2 });
    expect(updateBlockedReason(status)).toMatch(/Merge live into dev/);
  });

  it("treats an unexpected response or a bad commit id as unavailable", () => {
    expect(statusFromCompare({ message: "Not Found" }, sha("a"))).toEqual({ state: "unavailable" });
    expect(statusFromCompare({ ahead_by: 1, behind_by: 0, commits: [] }, "not-a-sha")).toEqual({ state: "unavailable" });
  });

  it("explains the disabled button when GitHub isn't set up", () => {
    expect(updateBlockedReason({ state: "unconfigured" })).toMatch(/GITHUB_TOKEN/);
  });
});
