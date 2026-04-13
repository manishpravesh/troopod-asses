# Troopod - AI PM Assignment

Troopod is a Next.js app that personalizes an existing landing page using ad creative input.

The app flow:

1. Input ad creative as URL and/or image upload.
2. Input landing page URL.
3. Generate an enhanced variant that keeps the original page structure while improving message match and conversion clarity.
4. Review side-by-side previews and applied change log.

## Tech Stack

- Next.js 16 + App Router + TypeScript
- Native `fetch` for ingestion and LLM API calls (Gemini primary, OpenAI fallback)
- Guardrailed HTML text patching (no full-page regeneration)

## Environment

Create `.env.local` from `.env.example`:

```bash
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.0-flash

# Optional fallback
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-4.1-mini
```

Provider order: Gemini -> OpenAI -> deterministic fallback heuristics.

If no API keys are set, the app still works using deterministic fallback heuristics.

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## How It Works

- `src/app/api/personalize/route.ts`
  - Accepts multipart form data (landing URL, ad URL, ad image).
  - Converts uploaded image to data URL for optional vision analysis.
- `src/lib/personalization.ts`
  - Fetches landing page HTML.
  - Extracts CRO-critical slots (headline, subheadline, CTA, bullets).
  - Analyzes ad creative and generates structured patch instructions.
  - Applies safe text-only edits and runs guardrails.
- `src/components/personalization-studio.tsx`
  - Input form, ad insight summary, change log, original/personalized preview.

## Guardrails

- Keeps original page structure and only edits text in key CRO slots.
- Removes risky elements (`script`, `iframe`, `object`) in previews.
- Rolls back if critical UI elements disappear (for example missing H1/CTA).
- Avoids fabricated claims by constraining prompt and fallback logic.

## Deployment

Deploy on Vercel:

1. Import this repository.
2. Set environment variables.
3. Deploy and share the production URL as the assignment live demo link.
