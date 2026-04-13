import { NextResponse } from "next/server";
import { runPersonalization } from "@/lib/personalization";

export const runtime = "nodejs";

type RequestPayload = {
  landingUrl: string;
  adUrl?: string;
  adFileName?: string;
  adImageDataUrl?: string;
};

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function parseRequest(request: Request): Promise<RequestPayload> {
  const formData = await request.formData();

  const landingUrl = `${formData.get("landingUrl") ?? ""}`.trim();
  const adUrl = `${formData.get("adUrl") ?? ""}`.trim();
  const adFile = formData.get("adFile");

  if (!landingUrl || !isValidHttpUrl(landingUrl)) {
    throw new Error("Please provide a valid landing page URL.");
  }

  if (!adUrl && !(adFile instanceof File && adFile.size > 0)) {
    throw new Error("Please provide an ad creative URL or upload an ad image.");
  }

  const payload: RequestPayload = {
    landingUrl,
    adUrl: adUrl || undefined,
  };

  if (adFile instanceof File && adFile.size > 0) {
    if (adFile.size > 5 * 1024 * 1024) {
      throw new Error("Ad upload too large. Maximum size is 5MB.");
    }

    const bytes = await adFile.arrayBuffer();
    const mimeType = adFile.type || "image/png";

    payload.adFileName = adFile.name;
    payload.adImageDataUrl = `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
  }

  return payload;
}

export async function POST(request: Request) {
  try {
    const payload = await parseRequest(request);
    const result = await runPersonalization(payload);

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unexpected error",
      },
      { status: 400 },
    );
  }
}
