import type { ContributorId, TeamId, TeamRole } from "./types";

export const TEAMS: Record<TeamId, TeamRole> = {
  brand: {
    id: "brand",
    name: "Brand manager",
    shortName: "Brand",
    kind: "in-house",
    monogram: "BM",
  },
  ecommerce: {
    id: "ecommerce",
    name: "Ecommerce manager",
    shortName: "Ecommerce",
    kind: "in-house",
    monogram: "EC",
  },
  pr: {
    id: "pr",
    name: "Public relations manager",
    shortName: "PR",
    kind: "agency",
    monogram: "PR",
  },
  "visual-design": {
    id: "visual-design",
    name: "Visual design studio",
    shortName: "Visual design",
    kind: "agency",
    monogram: "VD",
  },
  "design-adaptation": {
    id: "design-adaptation",
    name: "Design adaptation studio",
    shortName: "Adaptation",
    kind: "agency",
    monogram: "DA",
  },
  "video-production": {
    id: "video-production",
    name: "Video production agency",
    shortName: "Video",
    kind: "agency",
    monogram: "VP",
  },
  "media-buy": {
    id: "media-buy",
    name: "Media buy agency",
    shortName: "Media",
    kind: "agency",
    monogram: "MB",
  },
};

export const AUTOMATION = {
  name: "GrowthOS Automations",
  shortName: "Automations",
  monogram: "GA",
} as const;

export function contributorName(id: ContributorId): string {
  return id === "automation" ? AUTOMATION.name : TEAMS[id].name;
}

export function contributorShortName(id: ContributorId): string {
  return id === "automation" ? AUTOMATION.shortName : TEAMS[id].shortName;
}
