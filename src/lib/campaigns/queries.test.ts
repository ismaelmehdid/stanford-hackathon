import { describe, expect, it } from "vitest";
import { CAMPAIGNS } from "./data";
import {
  baseCampaign,
  branchStatus,
  campaignPath,
  diffStat,
  draftTitle,
  formatDate,
  formatDuration,
  getCampaign,
  groupByDay,
  isInDefaultBranch,
  lastActivity,
  latestCommitByFolder,
  latestLoopEvent,
  latestRelease,
  listCampaigns,
  LOOP_STAGES,
  releaseContributors,
  teamSummaries,
  updateStatus,
  weeklyCommitCounts,
} from "./queries";
import type { Campaign, Commit } from "./types";

const commit = (overrides: Partial<Commit>): Commit => ({
  sha: "0000000",
  author: "brand",
  authorName: "Test Author",
  message: "Test commit",
  date: "2026-10-01T10:00:00Z",
  branch: "main",
  files: [],
  ...overrides,
});

const campaign = (overrides: Partial<Campaign>): Campaign => ({
  slug: "test",
  owner: "brand",
  brand: "Brand",
  name: "Test",
  description: "",
  status: "live",
  defaultBranch: "main",
  channels: [],
  markets: [],
  budget: "$0",
  window: { start: "2026-01-01", end: "2026-12-31" },
  kpis: [],
  contributors: [],
  branches: [],
  commits: [],
  pullRequests: [],
  workflows: [],
  releases: [],
  ...overrides,
});

describe("campaign lookup", () => {
  it("finds a campaign by owner and slug", () => {
    const found = getCampaign("ondine", "bond-repair-fall-26");
    expect(found?.name).toBe("Bond Repair Serum: Fall Relaunch");
    expect(found && campaignPath(found)).toBe(
      "/campaigns/ondine/bond-repair-fall-26",
    );
    expect(getCampaign("ondine", "missing")).toBeUndefined();
  });

  it("lists campaigns by latest activity", () => {
    const listed = listCampaigns();
    expect(listed).toHaveLength(CAMPAIGNS.length);
    const dates = listed.map(lastActivity);
    expect(dates).toEqual([...dates].sort().reverse());
  });
});

describe("lastActivity", () => {
  it("takes the latest of commits, pull requests and workflow runs", () => {
    const value = lastActivity(
      campaign({
        commits: [commit({ date: "2026-10-01T00:00:00Z" })],
        workflows: [
          {
            id: "w",
            name: "W",
            trigger: "",
            engine: "analysis",
            steps: [],
            enabled: true,
            runs: [
              {
                id: 1,
                status: "success",
                startedAt: "2026-10-05T00:00:00Z",
                durationSeconds: 1,
                trigger: "",
                summary: "",
              },
            ],
          },
        ],
      }),
    );
    expect(value).toBe("2026-10-05T00:00:00Z");
  });
});

describe("isInDefaultBranch", () => {
  it("counts commits from merged pull requests only", () => {
    const subject = campaign({
      pullRequests: [
        { number: 1, status: "merged" },
        { number: 2, status: "open" },
      ].map(
        ({ number, status }) =>
          ({
            number,
            status,
            head: `b${number}`,
          }) as Campaign["pullRequests"][number],
      ),
    });
    expect(isInDefaultBranch(subject, commit({}))).toBe(true);
    expect(
      isInDefaultBranch(subject, commit({ branch: "b1", pullRequest: 1 })),
    ).toBe(true);
    expect(
      isInDefaultBranch(subject, commit({ branch: "b2", pullRequest: 2 })),
    ).toBe(false);
  });
});

describe("groupByDay", () => {
  it("groups by UTC day, newest first", () => {
    const groups = groupByDay([
      commit({ sha: "a", date: "2026-10-01T08:00:00Z" }),
      commit({ sha: "b", date: "2026-10-02T23:30:00Z" }),
      commit({ sha: "c", date: "2026-10-01T20:00:00Z" }),
    ]);
    expect(groups.map(({ day }) => day)).toEqual(["2026-10-02", "2026-10-01"]);
    expect(groups[1].commits.map(({ sha }) => sha)).toEqual(["c", "a"]);
  });
});

describe("latestCommitByFolder", () => {
  it("shows the newest default-branch commit per folder", () => {
    const folders = latestCommitByFolder(
      campaign({
        commits: [
          commit({
            sha: "new",
            date: "2026-10-03T00:00:00Z",
            files: [
              {
                path: "media/plan.csv",
                change: "modified",
                additions: 1,
                deletions: 1,
              },
            ],
          }),
          commit({
            sha: "branch",
            branch: "draft",
            date: "2026-10-04T00:00:00Z",
            files: [
              {
                path: "pr/draft.md",
                change: "added",
                additions: 4,
                deletions: 0,
              },
            ],
          }),
          commit({
            sha: "old",
            date: "2026-10-01T00:00:00Z",
            files: [
              {
                path: "media/plan.csv",
                change: "added",
                additions: 9,
                deletions: 0,
              },
              {
                path: "media/old.csv",
                change: "added",
                additions: 2,
                deletions: 0,
              },
              {
                path: "brief/brief.md",
                change: "added",
                additions: 5,
                deletions: 0,
              },
            ],
          }),
        ],
      }),
    );
    expect(
      folders.map(({ folder, commit, fileCount }) => [
        folder,
        commit.sha,
        fileCount,
      ]),
    ).toEqual([
      ["brief", "old", 1],
      ["media", "new", 2],
    ]);
  });

  it("drops removed files from the count", () => {
    const [media] = latestCommitByFolder(
      campaign({
        commits: [
          commit({
            sha: "b",
            date: "2026-10-02T00:00:00Z",
            files: [
              {
                path: "media/a.csv",
                change: "removed",
                additions: 0,
                deletions: 3,
              },
            ],
          }),
          commit({
            sha: "a",
            date: "2026-10-01T00:00:00Z",
            files: [
              {
                path: "media/a.csv",
                change: "added",
                additions: 3,
                deletions: 0,
              },
              {
                path: "media/b.csv",
                change: "added",
                additions: 3,
                deletions: 0,
              },
            ],
          }),
        ],
      }),
    );
    expect(media.fileCount).toBe(1);
  });
});

describe("branchStatus", () => {
  it("counts branch commits and main commits since the branch started", () => {
    const subject = campaign({
      commits: [
        commit({ sha: "m2", date: "2026-10-05T00:00:00Z" }),
        commit({ sha: "f2", branch: "feature", date: "2026-10-04T00:00:00Z" }),
        commit({ sha: "f1", branch: "feature", date: "2026-10-02T00:00:00Z" }),
        commit({ sha: "m1", date: "2026-10-03T00:00:00Z" }),
        commit({ sha: "m0", date: "2026-10-01T00:00:00Z" }),
      ],
    });
    expect(branchStatus(subject, { name: "feature" })).toEqual({
      ahead: 2,
      behind: 2,
    });
    expect(branchStatus(subject, { name: "missing" })).toEqual({
      ahead: 0,
      behind: 0,
    });
  });
});

describe("teamSummaries", () => {
  it("returns every team plus automation, with their work", () => {
    const summaries = teamSummaries(
      getCampaign("ondine", "bond-repair-fall-26")!,
    );
    expect(summaries.map(({ id }) => id)).toEqual([
      "brand",
      "ecommerce",
      "pr",
      "visual-design",
      "design-adaptation",
      "video-production",
      "media-buy",
      "automation",
    ]);
    const video = summaries.find(({ id }) => id === "video-production")!;
    expect(video.contributor?.org).toBe("Frame Forty Films");
    expect(video.commits[0].sha).toBe("b7d0f13");
    expect(video.openPullRequests).toBe(1);
    const brand = summaries.find(({ id }) => id === "brand")!;
    expect(brand.reviews).toBeGreaterThan(0);
    expect(summaries.at(-1)?.contributor).toBeUndefined();
  });
});

describe("latestRelease", () => {
  it("picks the newest release or nothing", () => {
    expect(
      latestRelease(getCampaign("ondine", "bond-repair-fall-26")!)?.tag,
    ).toBe("v2.1");
    expect(latestRelease(campaign({}))).toBeUndefined();
  });
});

describe("weeklyCommitCounts", () => {
  it("buckets commits into weeks ending at the given date", () => {
    const counts = weeklyCommitCounts(
      [
        commit({ date: "2026-10-10T00:00:00Z" }),
        commit({ date: "2026-10-04T00:00:00Z" }),
        commit({ date: "2026-10-02T00:00:00Z" }),
        commit({ date: "2026-09-01T00:00:00Z" }),
      ],
      3,
      "2026-10-10T00:00:00Z",
    );
    expect(counts).toEqual([0, 1, 2]);
  });
});

describe("formatting", () => {
  it("sums a diff", () => {
    expect(
      diffStat([
        { path: "a.md", change: "added", additions: 4, deletions: 1 },
        {
          path: "b.mp4",
          change: "added",
          additions: 0,
          deletions: 0,
          binary: true,
        },
      ]),
    ).toEqual({ additions: 4, deletions: 1, binary: 1 });
  });

  it("prints dates in UTC", () => {
    expect(formatDate("2026-10-09T23:30:00Z")).toBe("Oct 9");
    expect(formatDate("2026-10-09T23:30:00Z", "long")).toBe("Oct 9, 2026");
  });

  it("prints durations", () => {
    expect(formatDuration(48)).toBe("48s");
    expect(formatDuration(742)).toBe("12m 22s");
    expect(formatDuration(120)).toBe("2m");
  });
});

describe("releaseContributors", () => {
  it("lists the teams with commits since the previous release", () => {
    const bondRepair = getCampaign("ondine", "bond-repair-fall-26")!;
    const byTag = (tag: string) =>
      bondRepair.releases.find((release) => release.tag === tag)!;
    expect(releaseContributors(bondRepair, byTag("v2.0"))).toEqual([
      "brand",
      "ecommerce",
      "pr",
      "visual-design",
      "design-adaptation",
      "video-production",
      "media-buy",
      "automation",
    ]);
    // The unmerged lifestyle hero branch never reaches a release.
    expect(releaseContributors(bondRepair, byTag("v2.1"))).not.toContain(
      "visual-design",
    );
  });
});

describe("latestLoopEvent", () => {
  it("finds the newest commit for each stage", () => {
    const bondRepair = getCampaign("ondine", "bond-repair-fall-26")!;
    expect(latestLoopEvent(bondRepair, "analyze")?.sha).toBe("4f2a8e6");
    expect(latestLoopEvent(bondRepair, "brief")?.sha).toBe("4f2a8e6");
    expect(latestLoopEvent(bondRepair, "produce")?.sha).toBe("b7d0f13");
    expect(latestLoopEvent(bondRepair, "adapt")?.sha).toBe("a0d6f71");
    expect(latestLoopEvent(bondRepair, "ship")?.tag).toBe("v2.1");
    expect(latestLoopEvent(bondRepair, "measure")?.sha).toBe("9be2c44");
    expect(LOOP_STAGES.map(({ id }) => id)).toEqual([
      "analyze",
      "brief",
      "produce",
      "adapt",
      "ship",
      "measure",
    ]);
  });
});

describe("update status and drafts", () => {
  const bondRepair = getCampaign("ondine", "bond-repair-fall-26")!;
  const bySha = (sha: string) =>
    bondRepair.commits.find((commit) => commit.sha === sha)!;

  it("says where each update stands", () => {
    expect(updateStatus(bondRepair, bySha("9be2c44"))).toBe("live");
    expect(updateStatus(bondRepair, bySha("2c7e9b8"))).toBe("live");
    expect(updateStatus(bondRepair, bySha("e41c9a2"))).toBe("in-review");
    expect(updateStatus(bondRepair, bySha("a3f9e60"))).toBe("declined");
    expect(updateStatus(bondRepair, bySha("c93e5b0"))).toBe("draft");
  });

  it("names drafts after their request, description or branch", () => {
    expect(draftTitle(bondRepair, "shine-reveal")).toBe(
      "Shine reveal cut from storyboard take 2",
    );
    expect(draftTitle(bondRepair, "holiday-bundle")).toBe(
      "Holiday bundle product page",
    );
    expect(draftTitle(bondRepair, "some-idea")).toBe("some idea");
  });

  it("finds the campaign another was built on", () => {
    const holiday = getCampaign("ondine", "holiday-gift-sets-26")!;
    expect(baseCampaign(holiday)?.slug).toBe("bond-repair-fall-26");
    expect(baseCampaign(bondRepair)).toBeUndefined();
  });
});
