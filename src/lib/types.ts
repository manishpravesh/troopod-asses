export type AdInsight = {
  audience: string;
  problem: string;
  offer: string;
  tone: string;
  ctaAngle: string;
  rawSignals: string[];
};

export type LandingSnapshot = {
  url: string;
  title: string;
  metaDescription: string;
  heroHeadline: string;
  heroSubheadline: string;
  primaryCta: string;
  bullets: string[];
  safePreviewHtml: string;
};

export type PersonalizationPatch = {
  headline?: string;
  subheadline?: string;
  cta?: string;
  bullets?: string[];
  rationales: string[];
};

export type AppliedChange = {
  zone: "headline" | "subheadline" | "cta" | "bullets";
  before: string;
  after: string;
  reason: string;
};

export type PersonalizationResult = {
  originalHtml: string;
  personalizedHtml: string;
  adInsight: AdInsight;
  snapshot: Omit<LandingSnapshot, "safePreviewHtml">;
  changes: AppliedChange[];
  warnings: string[];
};
