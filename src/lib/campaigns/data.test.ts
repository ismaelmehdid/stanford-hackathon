import { describe, expect, it } from "vitest";
import { CAMPAIGNS } from "./data";
import { TEAMS } from "./teams";
import { TEAM_IDS } from "./types";

describe("sample campaigns", () => {
  it("uses unique campaign paths and commit shas", () => {
    const paths = CAMPAIGNS.map(({ owner, slug }) => `${owner}/${slug}`);
    expect(new Set(paths).size).toBe(paths.length);
    const shas = CAMPAIGNS.flatMap(({ commits }) => commits.map((c) => c.sha));
    expect(new Set(shas).size).toBe(shas.length);
    for (const sha of shas) expect(sha).toMatch(/^[0-9a-f]{7}$/);
  });

  it("defines every team role", () => {
    expect(Object.keys(TEAMS).sort()).toEqual([...TEAM_IDS].sort());
  });

  describe.each(CAMPAIGNS.map((campaign) => [campaign.slug, campaign]))(
    "%s",
    (_slug, campaign) => {
      it("lists commits newest first", () => {
        const dates = campaign.commits.map((commit) => commit.date);
        expect(dates).toEqual([...dates].sort().reverse());
      });

      it("has one contributor per team", () => {
        const teams = campaign.contributors.map(({ teamId }) => teamId);
        expect([...teams].sort()).toEqual([...TEAM_IDS].sort());
      });

      it("links commits to pull requests on their head or base branch", () => {
        for (const commit of campaign.commits) {
          if (commit.pullRequest === undefined) continue;
          const pullRequest = campaign.pullRequests.find(
            ({ number }) => number === commit.pullRequest,
          );
          expect(pullRequest, commit.sha).toBeDefined();
          expect([pullRequest!.head, pullRequest!.base]).toContain(
            commit.branch,
          );
        }
      });

      it("keeps branches only for unmerged pull requests", () => {
        const branchNames = campaign.branches.map(({ name }) => name);
        for (const pullRequest of campaign.pullRequests) {
          if (pullRequest.status === "merged")
            expect(branchNames).not.toContain(pullRequest.head);
          else expect(branchNames).toContain(pullRequest.head);
        }
        for (const branch of campaign.branches)
          expect(
            campaign.commits.some((commit) => commit.branch === branch.name),
            branch.name,
          ).toBe(true);
      });

      it("cuts every release at a tagged commit", () => {
        const tags = campaign.commits.flatMap(({ tag }) => (tag ? [tag] : []));
        expect(campaign.releases.map(({ tag }) => tag).sort()).toEqual(
          [...tags].sort(),
        );
      });

      it("only asks contributing teams for reviews", () => {
        for (const pullRequest of campaign.pullRequests) {
          for (const review of pullRequest.reviews)
            expect(review.reviewer).not.toBe(pullRequest.author);
          for (const reviewer of pullRequest.requestedReviewers)
            expect(TEAM_IDS).toContain(reviewer);
        }
      });
    },
  );
});
