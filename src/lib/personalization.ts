import {
  type AdInsight,
  type AppliedChange,
  type LandingSnapshot,
  type PersonalizationPatch,
  type PersonalizationResult,
} from "@/lib/types";

const CTA_KEYWORDS = [
  "start",
  "get",
  "book",
  "buy",
  "shop",
  "join",
  "try",
  "claim",
  "download",
  "learn",
  "talk",
  "schedule",
  "request",
  "free",
  "demo",
];

const STOPWORDS = new Set([
  "www",
  "http",
  "https",
  "com",
  "net",
  "org",
  "the",
  "and",
  "for",
  "with",
  "from",
  "your",
  "this",
  "that",
  "campaign",
  "creative",
]);

const GEMINI_ENDPOINT_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";
const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripTags(value: string): string {
  return normalizeWhitespace(
    value
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'"),
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseJsonFromText<T>(text: string): T | undefined {
  const start = text.indexOf("{");
  if (start === -1) {
    return undefined;
  }

  let depth = 0;
  let end = -1;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) {
      end = i;
      break;
    }
  }

  if (end === -1) {
    return undefined;
  }

  const candidate = text.slice(start, end + 1);
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return undefined;
  }
}

function getResponseText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const typed = payload as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };

  if (typeof typed.output_text === "string") {
    return typed.output_text;
  }

  const chunks = typed.output
    ?.flatMap((item) => item.content ?? [])
    .filter(
      (part) => part?.type === "output_text" && typeof part.text === "string",
    )
    .map((part) => part.text as string);

  return chunks?.join("\n") ?? "";
}

function getGeminiResponseText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";

  const typed = payload as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const candidate = typed.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const chunks = parts
    .map((part) => part.text)
    .filter((text): text is string => typeof text === "string");

  return chunks.join("\n").trim();
}

function parseDataUrl(
  value: string,
): { mimeType: string; dataBase64: string } | undefined {
  const match = value.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) return undefined;

  return {
    mimeType: match[1],
    dataBase64: match[2],
  };
}

async function fetchImageAsDataUrl(
  imageUrl: string,
): Promise<string | undefined> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(imageUrl, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "image/*",
      },
    });

    clearTimeout(timeout);

    if (!response.ok) return undefined;

    const contentType = response.headers.get("content-type") ?? "image/png";
    if (!contentType.startsWith("image/")) return undefined;

    const bytes = await response.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    return `data:${contentType};base64,${base64}`;
  } catch {
    return undefined;
  }
}

async function toGeminiInlineImage(args: {
  imageDataUrl?: string;
  imageUrl?: string;
}): Promise<{ mimeType: string; data: string } | undefined> {
  if (args.imageDataUrl) {
    const parsed = parseDataUrl(args.imageDataUrl);
    if (parsed) {
      return {
        mimeType: parsed.mimeType,
        data: parsed.dataBase64,
      };
    }
  }

  if (args.imageUrl) {
    const dataUrl = await fetchImageAsDataUrl(args.imageUrl);
    if (!dataUrl) return undefined;

    const parsed = parseDataUrl(dataUrl);
    if (parsed) {
      return {
        mimeType: parsed.mimeType,
        data: parsed.dataBase64,
      };
    }
  }

  return undefined;
}

async function requestStructuredJsonWithGemini<T>(args: {
  system: string;
  user: string;
  imageUrl?: string;
  imageDataUrl?: string;
}): Promise<T | undefined> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return undefined;

  const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
  const inlineImage = await toGeminiInlineImage(args);

  const userText = args.imageUrl
    ? `${args.user}\n\nAd creative URL: ${args.imageUrl}`
    : args.user;

  const parts: Array<Record<string, unknown>> = [{ text: userText }];
  if (inlineImage) {
    parts.push({
      inlineData: {
        mimeType: inlineImage.mimeType,
        data: inlineImage.data,
      },
    });
  }

  const payload = {
    systemInstruction: {
      parts: [{ text: args.system }],
    },
    contents: [
      {
        role: "user",
        parts,
      },
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  };

  const response = await fetch(
    `${GEMINI_ENDPOINT_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    return undefined;
  }

  const data = (await response.json()) as unknown;
  const text = getGeminiResponseText(data);
  if (!text) return undefined;

  return parseJsonFromText<T>(text);
}

async function requestStructuredJsonWithOpenAI<T>(args: {
  system: string;
  user: string;
  imageUrl?: string;
  imageDataUrl?: string;
}): Promise<T | undefined> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return undefined;

  const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

  const userContent: Array<Record<string, string>> = [
    { type: "input_text", text: args.user },
  ];

  if (args.imageDataUrl) {
    userContent.push({ type: "input_image", image_url: args.imageDataUrl });
  } else if (args.imageUrl) {
    userContent.push({ type: "input_image", image_url: args.imageUrl });
  }

  const payload = {
    model,
    temperature: 0.2,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: args.system }],
      },
      {
        role: "user",
        content: userContent,
      },
    ],
  };

  const response = await fetch(OPENAI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return undefined;
  }

  const data = (await response.json()) as unknown;
  const text = getResponseText(data);
  if (!text) return undefined;

  return parseJsonFromText<T>(text);
}

function findTagTexts(html: string, tagName: string): string[] {
  const regex = new RegExp(
    `<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`,
    "gi",
  );
  const items: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    const text = stripTags(match[1]);
    if (text.length > 0) items.push(text);
  }

  return items;
}

function findTitle(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return titleMatch ? stripTags(titleMatch[1]) : "Untitled landing page";
}

function findMetaDescription(html: string): string {
  const descMatch = html.match(
    /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i,
  );
  return descMatch ? normalizeWhitespace(descMatch[1]) : "";
}

function findPrimaryCta(html: string): string {
  const candidates: string[] = [];

  for (const tag of ["button", "a"]) {
    const regex = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html)) !== null) {
      const text = stripTags(match[1]);
      if (text.length >= 2 && text.length <= 80) {
        candidates.push(text);
      }
    }
  }

  const keywordMatch = candidates.find((candidate) => {
    const normalized = candidate.toLowerCase();
    return CTA_KEYWORDS.some((keyword) => normalized.includes(keyword));
  });

  return keywordMatch ?? candidates[0] ?? "Get Started";
}

function sanitizeHtmlForPreview(html: string, pageUrl: string): string {
  let sanitized = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, "")
    .replace(/<embed[^>]*>/gi, "");

  const baseTag = `<base href="${escapeHtml(pageUrl)}" />`;
  const hardeningStyle =
    "<style>html{scroll-behavior:smooth;} body{min-height:100vh;}</style>";

  if (/<head[^>]*>/i.test(sanitized)) {
    sanitized = sanitized.replace(
      /<head[^>]*>/i,
      (match) => `${match}${baseTag}${hardeningStyle}`,
    );
  } else {
    sanitized = `<head>${baseTag}${hardeningStyle}</head>${sanitized}`;
  }

  return sanitized;
}

function urlToSignals(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token))
    .slice(0, 12);
}

function isAdInsight(value: unknown): value is AdInsight {
  if (!value || typeof value !== "object") return false;
  const typed = value as Record<string, unknown>;
  return (
    typeof typed.audience === "string" &&
    typeof typed.problem === "string" &&
    typeof typed.offer === "string" &&
    typeof typed.tone === "string" &&
    typeof typed.ctaAngle === "string" &&
    Array.isArray(typed.rawSignals)
  );
}

function isPatch(value: unknown): value is PersonalizationPatch {
  if (!value || typeof value !== "object") return false;
  const typed = value as Record<string, unknown>;
  return (
    Array.isArray(typed.rationales) &&
    (typed.headline === undefined || typeof typed.headline === "string") &&
    (typed.subheadline === undefined ||
      typeof typed.subheadline === "string") &&
    (typed.cta === undefined || typeof typed.cta === "string") &&
    (typed.bullets === undefined || Array.isArray(typed.bullets))
  );
}

async function requestStructuredJson<T>(args: {
  system: string;
  user: string;
  imageUrl?: string;
  imageDataUrl?: string;
}): Promise<T | undefined> {
  const geminiResult = await requestStructuredJsonWithGemini<T>(args);
  if (geminiResult) return geminiResult;

  const openAiResult = await requestStructuredJsonWithOpenAI<T>(args);
  if (openAiResult) return openAiResult;

  return undefined;
}

export async function extractLandingSnapshot(
  url: string,
): Promise<LandingSnapshot> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  let html: string;
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) {
      throw new Error(`Landing page request failed with ${response.status}`);
    }

    html = await response.text();
  } finally {
    clearTimeout(timeout);
  }

  if (!html || html.length < 50) {
    throw new Error("Landing page HTML could not be fetched.");
  }

  const h1s = findTagTexts(html, "h1");
  const pTags = findTagTexts(html, "p");
  const h2s = findTagTexts(html, "h2");
  const bullets = findTagTexts(html, "li")
    .filter((item) => item.length >= 20)
    .slice(0, 3);

  return {
    url,
    title: findTitle(html),
    metaDescription: findMetaDescription(html),
    heroHeadline: h1s.find((text) => text.length > 10) ?? h1s[0] ?? "",
    heroSubheadline:
      pTags.find((text) => text.length >= 30) ??
      h2s.find((text) => text.length >= 20) ??
      "",
    primaryCta: findPrimaryCta(html),
    bullets,
    safePreviewHtml: sanitizeHtmlForPreview(html, url),
  };
}

export async function analyzeAdCreative(args: {
  adUrl?: string;
  adFileName?: string;
  adImageDataUrl?: string;
}): Promise<AdInsight> {
  const rawSignals = [args.adUrl ?? "", args.adFileName ?? ""].flatMap(
    urlToSignals,
  );

  const fallback: AdInsight = {
    audience: rawSignals[0]
      ? `${rawSignals[0]}-focused buyers`
      : "high-intent visitors",
    problem: "unclear value proposition and low message match",
    offer: rawSignals[1]
      ? `a ${rawSignals[1]}-oriented offer`
      : "a clear conversion offer",
    tone: "direct and benefit-first",
    ctaAngle: "low-friction next step",
    rawSignals,
  };

  const aiResponse = await requestStructuredJson<AdInsight>({
    system:
      "You are an ad creative strategist. Return strictly valid JSON only, no markdown. Keep outputs concise, factual, and infer from visible ad signals only.",
    user: `Analyze this ad creative context and return JSON with keys: audience, problem, offer, tone, ctaAngle, rawSignals (array of strings).

Known context:\n- adUrl: ${args.adUrl ?? "n/a"}\n- adFileName: ${args.adFileName ?? "n/a"}\n- seedSignals: ${rawSignals.join(", ") || "none"}`,
    imageUrl: args.adUrl,
    imageDataUrl: args.adImageDataUrl,
  });

  if (isAdInsight(aiResponse)) {
    return {
      ...aiResponse,
      rawSignals: aiResponse.rawSignals.slice(0, 12),
    };
  }

  return fallback;
}

export async function buildPersonalizationPatch(args: {
  snapshot: LandingSnapshot;
  adInsight: AdInsight;
}): Promise<PersonalizationPatch> {
  const { snapshot, adInsight } = args;

  const fallbackPatch: PersonalizationPatch = {
    headline:
      snapshot.heroHeadline.length > 0
        ? `${snapshot.heroHeadline} for ${adInsight.audience}`
        : `Better outcomes for ${adInsight.audience}`,
    subheadline:
      snapshot.heroSubheadline.length > 0
        ? `${snapshot.heroSubheadline} Built around ${adInsight.offer}.`
        : `Built around ${adInsight.offer}, with a ${adInsight.tone} narrative and stronger message match.`,
    cta: "Get Your Personalized Plan",
    bullets:
      snapshot.bullets.length > 0
        ? snapshot.bullets.map(
            (bullet) => `${bullet} aligned to ${adInsight.ctaAngle}`,
          )
        : [
            `Clarify value quickly for ${adInsight.audience}`,
            "Reduce friction in the first click",
            "Strengthen trust with specific proof",
          ],
    rationales: [
      "Align top-fold message to ad audience and promise.",
      "Increase CTA clarity and intent match.",
      "Reframe supporting bullets for conversion momentum.",
    ],
  };

  const aiResponse = await requestStructuredJson<PersonalizationPatch>({
    system:
      "You are a CRO personalization engine. Return strictly valid JSON only. Do not output markdown or prose. Never invent factual claims beyond given context.",
    user: `Generate a personalization patch for this landing page using this ad profile.

Return JSON with keys: headline (optional), subheadline (optional), cta (optional), bullets (optional string array max 3), rationales (string array 2-5).

Constraints:\n- Keep existing page structure.\n- Only improve message match and conversion clarity.\n- Keep language realistic and concise.\n- No fake guarantees, no fabricated metrics.

Landing snapshot:\n${JSON.stringify(
      {
        title: snapshot.title,
        metaDescription: snapshot.metaDescription,
        heroHeadline: snapshot.heroHeadline,
        heroSubheadline: snapshot.heroSubheadline,
        primaryCta: snapshot.primaryCta,
        bullets: snapshot.bullets,
      },
      null,
      2,
    )}

Ad insight:\n${JSON.stringify(adInsight, null, 2)}`,
  });

  if (isPatch(aiResponse)) {
    return {
      headline: aiResponse.headline,
      subheadline: aiResponse.subheadline,
      cta: aiResponse.cta,
      bullets: Array.isArray(aiResponse.bullets)
        ? aiResponse.bullets
            .filter((item) => typeof item === "string")
            .slice(0, 3)
        : undefined,
      rationales: aiResponse.rationales.slice(0, 5),
    };
  }

  return fallbackPatch;
}

function replaceFirstTagText(args: {
  html: string;
  tagName: "h1" | "h2" | "p" | "button" | "a" | "li";
  nextText: string;
  predicate?: (currentText: string) => boolean;
}): { html: string; before?: string } {
  const regex = new RegExp(
    `<${args.tagName}\\b([^>]*)>([\\s\\S]*?)<\\/${args.tagName}>`,
    "i",
  );
  const match = args.html.match(regex);
  if (!match) return { html: args.html };

  const before = stripTags(match[2]);
  if (!before) return { html: args.html };
  if (args.predicate && !args.predicate(before)) return { html: args.html };

  const replacement = `<${args.tagName}${match[1]}>${escapeHtml(args.nextText)}</${args.tagName}>`;
  return {
    html: args.html.replace(regex, replacement),
    before,
  };
}

export function applyPersonalization(args: {
  snapshot: LandingSnapshot;
  patch: PersonalizationPatch;
  adInsight: AdInsight;
}): PersonalizationResult {
  const { snapshot, patch, adInsight } = args;
  const warnings: string[] = [];
  const changes: AppliedChange[] = [];

  let personalized = snapshot.safePreviewHtml;

  if (patch.headline && patch.headline.length <= 140) {
    const replaced = replaceFirstTagText({
      html: personalized,
      tagName: "h1",
      nextText: patch.headline,
      predicate: (text) => text.length >= 6,
    });
    personalized = replaced.html;
    if (replaced.before) {
      changes.push({
        zone: "headline",
        before: replaced.before,
        after: patch.headline,
        reason: patch.rationales[0] ?? "Align headline with ad promise.",
      });
    }
  }

  if (patch.subheadline && patch.subheadline.length <= 220) {
    let replaced = replaceFirstTagText({
      html: personalized,
      tagName: "p",
      nextText: patch.subheadline,
      predicate: (text) => text.length >= 25,
    });

    if (!replaced.before) {
      replaced = replaceFirstTagText({
        html: personalized,
        tagName: "h2",
        nextText: patch.subheadline,
        predicate: (text) => text.length >= 20,
      });
    }

    personalized = replaced.html;
    if (replaced.before) {
      changes.push({
        zone: "subheadline",
        before: replaced.before,
        after: patch.subheadline,
        reason: patch.rationales[1] ?? "Improve value clarity.",
      });
    }
  }

  if (patch.cta && patch.cta.length <= 60) {
    let replaced = replaceFirstTagText({
      html: personalized,
      tagName: "button",
      nextText: patch.cta,
      predicate: (text) => text.length <= 80,
    });

    if (!replaced.before) {
      replaced = replaceFirstTagText({
        html: personalized,
        tagName: "a",
        nextText: patch.cta,
        predicate: (text) => text.length <= 80,
      });
    }

    personalized = replaced.html;
    if (replaced.before) {
      changes.push({
        zone: "cta",
        before: replaced.before,
        after: patch.cta,
        reason: patch.rationales[1] ?? "Raise CTA intent match.",
      });
    }
  }

  if (patch.bullets && patch.bullets.length > 0) {
    const nextBullets = patch.bullets
      .filter((bullet) => bullet.length > 0 && bullet.length <= 160)
      .slice(0, 3);
    let index = 0;
    personalized = personalized.replace(
      /<li\b([^>]*)>([\s\S]*?)<\/li>/gi,
      (match, attrs, inner) => {
        if (index >= nextBullets.length) return match;

        const before = stripTags(inner);
        if (before.length < 15) return match;

        const after = nextBullets[index];
        index += 1;

        changes.push({
          zone: "bullets",
          before,
          after,
          reason:
            patch.rationales[2] ?? "Tighten supporting conversion points.",
        });

        return `<li${attrs}>${escapeHtml(after)}</li>`;
      },
    );
  }

  if (!/<h1\b/i.test(personalized)) {
    warnings.push("Guardrail rollback: missing H1 after patching.");
  }

  if (!/(<a\b|<button\b)/i.test(personalized)) {
    warnings.push("Guardrail rollback: missing CTA element after patching.");
  }

  if (warnings.length > 0) {
    personalized = snapshot.safePreviewHtml;
    changes.length = 0;
  }

  if (changes.length === 0) {
    warnings.push(
      "No safe editable sections found; returned original-enhanced preview.",
    );
  }

  return {
    originalHtml: snapshot.safePreviewHtml,
    personalizedHtml: personalized,
    adInsight,
    snapshot: {
      url: snapshot.url,
      title: snapshot.title,
      metaDescription: snapshot.metaDescription,
      heroHeadline: snapshot.heroHeadline,
      heroSubheadline: snapshot.heroSubheadline,
      primaryCta: snapshot.primaryCta,
      bullets: snapshot.bullets,
    },
    changes,
    warnings,
  };
}

export async function runPersonalization(args: {
  landingUrl: string;
  adUrl?: string;
  adFileName?: string;
  adImageDataUrl?: string;
}): Promise<PersonalizationResult> {
  const snapshot = await extractLandingSnapshot(args.landingUrl);
  const adInsight = await analyzeAdCreative({
    adUrl: args.adUrl,
    adFileName: args.adFileName,
    adImageDataUrl: args.adImageDataUrl,
  });

  const patch = await buildPersonalizationPatch({ snapshot, adInsight });
  return applyPersonalization({ snapshot, patch, adInsight });
}
