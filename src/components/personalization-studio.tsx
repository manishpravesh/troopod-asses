"use client";

import { FormEvent, useMemo, useState } from "react";
import type { PersonalizationResult } from "@/lib/types";
import styles from "@/components/personalization-studio.module.css";

type ApiResponse =
  | {
      ok: true;
      result: PersonalizationResult;
    }
  | {
      ok: false;
      error: string;
    };

export function PersonalizationStudio() {
  const [landingUrl, setLandingUrl] = useState("https://themeforest.net/");
  const [adUrl, setAdUrl] = useState(
    "https://pub-1407f82391df4ab1951418d04be76914.r2.dev/uploads/5e160a52-7599-4172-b93d-c8f8874c5827.png",
  );
  const [adFile, setAdFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PersonalizationResult | null>(null);
  const [showOriginalPreview, setShowOriginalPreview] = useState(false);

  const fileLabel = useMemo(() => {
    if (!adFile) return "No file selected";
    return `${adFile.name} (${Math.ceil(adFile.size / 1024)} KB)`;
  }, [adFile]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const body = new FormData();
      body.append("landingUrl", landingUrl);
      if (adUrl.trim()) body.append("adUrl", adUrl.trim());
      if (adFile) body.append("adFile", adFile);

      const response = await fetch("/api/personalize", {
        method: "POST",
        body,
      });

      const data = (await response.json()) as ApiResponse;
      if (!response.ok || !data.ok) {
        throw new Error(data.ok ? "Request failed" : data.error);
      }

      setShowOriginalPreview(false);
      setResult(data.result);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to personalize",
      );
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-8 lg:px-10">
      <section className="relative overflow-hidden rounded-3xl border border-black/10 bg-white/90 p-6 shadow-[0_15px_70px_rgba(16,24,40,0.12)] backdrop-blur-xl sm:p-10">
        <div className={`absolute inset-x-0 top-0 h-40 ${styles.heroGlow}`} />
        <div className="relative grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-orange-700">
              Troopod AI PM Assignment
            </p>
            <h1 className="mt-3 text-4xl leading-tight font-semibold text-slate-900 sm:text-5xl">
              Personalized landing pages from ad creative in one flow
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-8 text-slate-700">
              Input an ad creative plus a landing page URL. Troopod analyzes
              message match, applies CRO-safe content edits, and returns an
              enhanced variant of the existing page.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-5"
          >
            <label className="block text-sm font-medium text-slate-700">
              Landing page URL
              <input
                type="url"
                required
                value={landingUrl}
                onChange={(event) => setLandingUrl(event.target.value)}
                placeholder="https://example.com/landing"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-orange-500 focus:ring"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Ad creative URL (optional if uploading)
              <input
                type="url"
                value={adUrl}
                onChange={(event) => setAdUrl(event.target.value)}
                placeholder="https://ads-platform.com/creative.jpg"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-orange-500 focus:ring"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Upload ad image
              <input
                type="file"
                accept="image/*"
                onChange={(event) => setAdFile(event.target.files?.[0] ?? null)}
                className="mt-1 block w-full cursor-pointer rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
              />
              <span className="mt-1 block text-xs text-slate-500">
                {fileLabel}
              </span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading
                ? "Generating personalized variant..."
                : "Generate personalized page"}
            </button>

            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}
          </form>
        </div>
      </section>

      {result ? (
        <section className="mt-8 grid gap-6">
          <div className="grid gap-4 md:grid-cols-3">
            <article className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Audience
              </h2>
              <p className="mt-2 text-sm text-slate-800">
                {result.adInsight.audience}
              </p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Offer
              </h2>
              <p className="mt-2 text-sm text-slate-800">
                {result.adInsight.offer}
              </p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                CTA Angle
              </h2>
              <p className="mt-2 text-sm text-slate-800">
                {result.adInsight.ctaAngle}
              </p>
            </article>
          </div>

          <article className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">
              Applied changes
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {result.changes.length > 0 ? (
                result.changes.map((change, index) => (
                  <li
                    key={`${change.zone}-${index}`}
                    className="rounded-lg border border-slate-100 bg-slate-50 p-3"
                  >
                    <p className="font-medium text-slate-900">
                      {change.zone.toUpperCase()} - {change.reason}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Before: {change.before}
                    </p>
                    <p className="text-xs text-slate-700">
                      After: {change.after}
                    </p>
                  </li>
                ))
              ) : (
                <li className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800">
                  No safe text slots were found to patch on this page.
                </li>
              )}
            </ul>

            {result.warnings.length > 0 ? (
              <ul className="mt-3 space-y-2 text-xs text-amber-800">
                {result.warnings.map((warning, index) => (
                  <li
                    key={`warn-${index}`}
                    className="rounded border border-amber-200 bg-amber-50 px-2 py-1"
                  >
                    {warning}
                  </li>
                ))}
              </ul>
            ) : null}
          </article>

          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => setShowOriginalPreview((value) => !value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              {showOriginalPreview
                ? "Hide original preview"
                : "Show original preview"}
            </button>
          </div>

          <div
            className={`grid gap-4 ${showOriginalPreview ? "lg:grid-cols-2" : "lg:grid-cols-1"}`}
          >
            {showOriginalPreview ? (
              <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-4 py-3">
                  <h2 className="text-sm font-semibold text-slate-900">
                    Original preview
                  </h2>
                </div>
                <iframe
                  title="Original landing preview"
                  srcDoc={result.originalHtml}
                  sandbox="allow-same-origin"
                  className={`w-full bg-white ${styles.previewFrame}`}
                />
              </article>
            ) : null}

            <article className="overflow-hidden rounded-2xl border border-orange-200 bg-white">
              <div className="border-b border-orange-200 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-900">
                  Personalized preview
                </h2>
              </div>
              <iframe
                title="Personalized landing preview"
                srcDoc={result.personalizedHtml}
                sandbox="allow-same-origin"
                className={`w-full bg-white ${styles.previewFrame}`}
              />
            </article>
          </div>
        </section>
      ) : null}
    </div>
  );
}
