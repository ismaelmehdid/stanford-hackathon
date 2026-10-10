import { CAMPAIGNS } from "./data";
import {
  TEAM_IDS,
  type Branch,
  type Campaign,
  type Commit,
  type Contributor,
  type ContributorId,
  type FileChange,
  type Release,
} from "./types";

export const campaignPath = (
  campaign: Pick<Campaign, "owner" | "slug">,
): string => `/campaigns/${campaign.owner}/${campaign.slug}`;

export const fullName = (campaign: Pick<Campaign, "owner" | "slug">) =>
  `${campaign.owner}/${campaign.slug}`;

export function getCampaign(
  owner: string,
  slug: string,
  campaigns: Campaign[] = CAMPAIGNS,
): Campaign | undefined {
  return campaigns.find(
    (campaign) => campaign.owner === owner && campaign.slug === slug,
  );
}

/** Campaigns with the most recent activity first. */
export function listCampaigns(campaigns: Campaign[] = CAMPAIGNS): Campaign[] {
  return [...campaigns].sort((a, b) =>
    lastActivity(b).localeCompare(lastActivity(a)),
  );
}

export function byDateDesc<T extends { date: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.date.localeCompare(a.date));
}

/** The latest commit, pull request update or workflow run. */
export function lastActivity(campaign: Campaign): string {
  const dates = [
    ...campaign.commits.map((commit) => commit.date),
    ...campaign.pullRequests.map((pullRequest) => pullRequest.updatedAt),
    ...campaign.workflows.flatMap((workflow) =>
      workflow.runs.map((run) => run.startedAt),
    ),
  ];
  return dates.reduce((latest, date) => (date > latest ? date : latest), "");
}

/** Commits on the default branch, including those from merged pull requests. */
export function isInDefaultBranch(campaign: Campaign, commit: Commit): boolean {
  if (commit.branch === campaign.defaultBranch) return true;
  const pullRequest = campaign.pullRequests.find(
    (candidate) => candidate.number === commit.pullRequest,
  );
  return pullRequest?.status === "merged";
}

/** Groups commits by UTC day, newest day first. */
export function groupByDay(
  commits: Commit[],
): { day: string; commits: Commit[] }[] {
  const groups = new Map<string, Commit[]>();
  for (const commit of byDateDesc(commits)) {
    const day = commit.date.slice(0, 10);
    groups.set(day, [...(groups.get(day) ?? []), commit]);
  }
  return [...groups].map(([day, dayCommits]) => ({
    day,
    commits: dayCommits,
  }));
}

/** The last default-branch commit to touch each top-level folder, A to Z. */
export function latestCommitByFolder(
  campaign: Campaign,
): { folder: string; commit: Commit; fileCount: number }[] {
  const folders = new Map<string, { commit: Commit; paths: Set<string> }>();
  // Merge commits on the default branch already carry their branch's files.
  const history = byDateDesc(campaign.commits)
    .filter((commit) => commit.branch === campaign.defaultBranch)
    .reverse();
  for (const commit of history) {
    for (const file of commit.files) {
      const folder = file.path.split("/")[0];
      const entry = folders.get(folder) ?? { commit, paths: new Set() };
      entry.commit = commit;
      if (file.change === "removed") entry.paths.delete(file.path);
      else entry.paths.add(file.path);
      folders.set(folder, entry);
    }
  }
  return [...folders]
    .map(([folder, { commit, paths }]) => ({
      folder,
      commit,
      fileCount: paths.size,
    }))
    .sort((a, b) => a.folder.localeCompare(b.folder));
}

/** Commits the branch has that main lacks, and main commits made since it started. */
export function branchStatus(
  campaign: Campaign,
  branch: Pick<Branch, "name">,
): { ahead: number; behind: number } {
  const own = campaign.commits.filter(
    (commit) => commit.branch === branch.name,
  );
  if (own.length === 0) return { ahead: 0, behind: 0 };
  const startedAt = own.reduce(
    (earliest, commit) => (commit.date < earliest ? commit.date : earliest),
    own[0].date,
  );
  const behind = campaign.commits.filter(
    (commit) =>
      commit.branch === campaign.defaultBranch && commit.date > startedAt,
  ).length;
  return { ahead: own.length, behind };
}

export type TeamSummary = {
  id: ContributorId;
  contributor?: Contributor;
  commits: Commit[];
  openPullRequests: number;
  reviews: number;
};

/** One entry per team in a fixed order, then automation. */
export function teamSummaries(campaign: Campaign): TeamSummary[] {
  const ids: ContributorId[] = [...TEAM_IDS, "automation"];
  return ids.map((id) => ({
    id,
    contributor: campaign.contributors.find(
      (contributor) => contributor.teamId === id,
    ),
    commits: byDateDesc(
      campaign.commits.filter((commit) => commit.author === id),
    ),
    openPullRequests: campaign.pullRequests.filter(
      (pullRequest) =>
        pullRequest.author === id && pullRequest.status === "open",
    ).length,
    reviews: campaign.pullRequests.flatMap((pullRequest) =>
      pullRequest.reviews.filter((review) => review.reviewer === id),
    ).length,
  }));
}

export function latestRelease(campaign: Campaign): Release | undefined {
  return [...campaign.releases].sort((a, b) => b.date.localeCompare(a.date))[0];
}

/** Commits per 7-day window, oldest first, ending at `end`. */
export function weeklyCommitCounts(
  commits: Commit[],
  weeks: number,
  end: string,
): number[] {
  const endTime = new Date(end).getTime();
  const week = 7 * 24 * 60 * 60 * 1000;
  const counts = Array.from({ length: weeks }, () => 0);
  for (const commit of commits) {
    const age = Math.floor((endTime - new Date(commit.date).getTime()) / week);
    if (age >= 0 && age < weeks) counts[weeks - 1 - age] += 1;
  }
  return counts;
}

export function diffStat(files: FileChange[]): {
  additions: number;
  deletions: number;
  binary: number;
} {
  return files.reduce(
    (total, file) => ({
      additions: total.additions + file.additions,
      deletions: total.deletions + file.deletions,
      binary: total.binary + (file.binary ? 1 : 0),
    }),
    { additions: 0, deletions: 0, binary: 0 },
  );
}

// Dates render in UTC so the server and the browser print the same text.
const shortDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const longDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const time = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
});

export function formatDate(
  iso: string,
  style: "short" | "long" = "short",
): string {
  return (style === "short" ? shortDate : longDate).format(new Date(iso));
}

export const formatTime = (iso: string) => `${time.format(new Date(iso))} UTC`;

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
}

/** The teams whose default-branch commits landed in a release. */
export function releaseContributors(
  campaign: Campaign,
  release: Release,
): ContributorId[] {
  const previous = [...campaign.releases]
    .filter((candidate) => candidate.date < release.date)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const included = campaign.commits.filter(
    (commit) =>
      isInDefaultBranch(campaign, commit) &&
      commit.date <= release.date &&
      (!previous || commit.date > previous.date),
  );
  const ids = new Set(included.map((commit) => commit.author));
  return [...TEAM_IDS, "automation" as const].filter((id) => ids.has(id));
}

export type LoopStage = {
  id: "analyze" | "brief" | "produce" | "adapt" | "ship" | "measure";
  title: string;
  owners: ContributorId[];
};

/** The test-and-learn loop every campaign runs, in order. */
export const LOOP_STAGES: LoopStage[] = [
  {
    id: "analyze",
    title: "Insights",
    owners: ["automation"],
  },
  {
    id: "brief",
    title: "Brief",
    owners: ["automation", "brand"],
  },
  {
    id: "produce",
    title: "Production",
    owners: ["video-production", "visual-design"],
  },
  {
    id: "adapt",
    title: "Adaptation",
    owners: ["design-adaptation"],
  },
  {
    id: "ship",
    title: "Go live",
    owners: ["brand", "media-buy", "pr", "ecommerce"],
  },
  {
    id: "measure",
    title: "Results",
    owners: ["media-buy", "ecommerce", "pr"],
  },
];

const touches = (commit: Commit, folder: string) =>
  commit.files.some((file) => file.path.startsWith(`${folder}/`));

/** The newest commit that moved a loop stage forward. */
export function latestLoopEvent(
  campaign: Campaign,
  stage: LoopStage["id"],
): Commit | undefined {
  const matches: Record<LoopStage["id"], (commit: Commit) => boolean> = {
    analyze: (commit) => commit.engine?.kind === "analysis",
    brief: (commit) => touches(commit, "brief"),
    produce: (commit) =>
      commit.author === "video-production" ||
      commit.author === "visual-design" ||
      commit.engine?.kind === "generation",
    adapt: (commit) => commit.author === "design-adaptation",
    ship: (commit) => commit.tag !== undefined,
    measure: (commit) => (commit.impact?.length ?? 0) > 0,
  };
  return byDateDesc(campaign.commits).find(matches[stage]);
}

/** The campaign this one was built on, if it is in the list. */
export function baseCampaign(
  campaign: Campaign,
  campaigns: Campaign[] = CAMPAIGNS,
): Campaign | undefined {
  if (!campaign.forkedFrom) return undefined;
  const [owner, slug] = campaign.forkedFrom.split("/");
  return getCampaign(owner, slug, campaigns);
}

export type UpdateStatus = "live" | "in-review" | "declined" | "draft";

/** Where an update stands: live, waiting for approval, declined or a draft. */
export function updateStatus(campaign: Campaign, commit: Commit): UpdateStatus {
  if (isInDefaultBranch(campaign, commit)) return "live";
  const pullRequest = campaign.pullRequests.find(
    (candidate) => candidate.number === commit.pullRequest,
  );
  if (pullRequest?.status === "open") return "in-review";
  if (pullRequest?.status === "closed") return "declined";
  return "draft";
}

/** A readable name for the draft an update belongs to. */
export function draftTitle(campaign: Campaign, branchName: string): string {
  const pullRequest = campaign.pullRequests.find(
    (candidate) => candidate.head === branchName,
  );
  const branch = campaign.branches.find(({ name }) => name === branchName);
  return (
    pullRequest?.title ?? branch?.description ?? branchName.replace(/-/g, " ")
  );
}
