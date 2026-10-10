/**
 * Campaigns are modeled like code repositories: every team's change is a
 * commit, proposed work is a pull request, launches are releases, and the
 * analysis and generation engine runs as automated workflows.
 *
 * The UI speaks marketing, not version control. Keep user-facing copy to:
 * commit = "update", pull request = "approval request" (open "In review",
 * merged "Approved", closed "Declined"), branch = "draft", default branch =
 * "the live campaign", release = "version", workflow = "automation",
 * forkedFrom = "Built on".
 */

export const TEAM_IDS = [
  "brand",
  "ecommerce",
  "pr",
  "visual-design",
  "design-adaptation",
  "video-production",
  "media-buy",
] as const;

export type TeamId = (typeof TEAM_IDS)[number];

/** Every commit, pull request and release comes from a team or from automation. */
export type ContributorId = TeamId | "automation";

export type TeamRole = {
  id: TeamId;
  name: string;
  shortName: string;
  kind: "in-house" | "agency";
  monogram: string;
};

/** The organization and person filling a team role on one campaign. */
export type Contributor = {
  teamId: TeamId;
  org: string;
  lead: string;
  since: string;
};

export type FileChange = {
  path: string;
  change: "added" | "modified" | "removed";
  additions: number;
  deletions: number;
  /** Images, video and design files have no line counts. */
  binary?: boolean;
};

/** A metric this change moved. `good` says whether the move helped. */
export type Impact = {
  metric: string;
  before: string;
  after: string;
  good: boolean;
};

/** A link into the analysis or generation feature that produced a change. */
export type EngineLink = {
  kind: "analysis" | "generation";
  label: string;
  href: string;
};

export type Commit = {
  sha: string;
  author: ContributorId;
  authorName: string;
  message: string;
  body?: string;
  date: string;
  branch: string;
  files: FileChange[];
  /** The release tag cut at this commit, if any. */
  tag?: string;
  impact?: Impact[];
  engine?: EngineLink;
  pullRequest?: number;
};

export type Branch = {
  name: string;
  author: ContributorId;
  description: string;
  updatedAt: string;
  pullRequest?: number;
};

export type Check = {
  name: string;
  status: "passed" | "failed" | "pending";
  detail: string;
};

export type Review = {
  reviewer: TeamId;
  state: "approved" | "changes_requested" | "commented";
  body: string;
  date: string;
};

export type PullRequest = {
  number: number;
  title: string;
  body: string;
  author: ContributorId;
  authorName: string;
  status: "open" | "merged" | "closed";
  head: string;
  base: string;
  createdAt: string;
  updatedAt: string;
  filesChanged: number;
  labels: string[];
  checks: Check[];
  reviews: Review[];
  requestedReviewers: TeamId[];
};

export type WorkflowRun = {
  id: number;
  status: "success" | "failure" | "running";
  startedAt: string;
  durationSeconds: number;
  trigger: string;
  summary: string;
  output?: EngineLink;
};

export type Workflow = {
  id: string;
  name: string;
  trigger: string;
  engine: "analysis" | "generation" | "media" | "adaptation" | "monitoring";
  steps: string[];
  /** The team that receives the pull request this workflow opens. */
  opensPullRequestFor?: TeamId;
  enabled: boolean;
  runs: WorkflowRun[];
};

export type Release = {
  tag: string;
  name: string;
  date: string;
  author: ContributorId;
  notes: string[];
  metrics: { label: string; value: string }[];
};

export type Kpi = {
  label: string;
  value: string;
  delta: string;
  note: string;
};

export type CampaignStatus = "live" | "planning" | "wrapped";

export type Campaign = {
  slug: string;
  /** The brand's account, shown before the slug like a repository owner. */
  owner: string;
  brand: string;
  name: string;
  description: string;
  status: CampaignStatus;
  defaultBranch: string;
  /** Another campaign this one was started from, as "owner/slug". */
  forkedFrom?: string;
  channels: string[];
  markets: string[];
  budget: string;
  window: { start: string; end: string };
  kpis: Kpi[];
  contributors: Contributor[];
  branches: Branch[];
  commits: Commit[];
  pullRequests: PullRequest[];
  workflows: Workflow[];
  releases: Release[];
};
