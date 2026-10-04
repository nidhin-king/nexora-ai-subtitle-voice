import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MODEL = "gemini-3.8-flash";
const API = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export async function POST(req: Request) {
  const key = process.env.GEMINI_API_KEY;

  if (!key) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured." },
      { status: 500 },
    );
  }

  try {
    const body = await req.json();
    const text = String(body.text ?? "").trim();
    const targetLanguage = String(body.targetLanguage ?? "").trim();
    const mode = String(body.mode ?? "Natural Translation").trim();

    if (!text || !targetLanguage) {
      return NextResponse.json(
        { error: "Text and target language are required." },
        { status: 400 },
      );
    }

    if (text.length > 12000) {
      return NextResponse.json(
        { error: "Keep each translation under 12,000 characters." },
        { status: 400 },
      );
    }

    const prompt = [
      `Translate the subtitle into ${targetLanguage}.`,
      `Mode: ${mode}.`,
      "Preserve meaning, names, numbers, technical terms, timing intent, and emotional intent.",
      "For Tamil or Malayalam, prefer natural spoken language used by native speakers rather than literal textbook translation.",
      "Return only the translated subtitle text, with no explanation or quotation marks.",
      `SOURCE:\n${text}`,
    ].join("\n\n");

    const response = await fetch(API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "text/plain",
        },
      }),
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data?.error?.message || "Translation failed." },
        { status: response.status },
      );
    }

    const output = data?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text || "")
      .join("")
      .trim();

    if (!output) {
      return NextResponse.json(
        { error: "Gemini returned no translation." },
        { status: 502 },
      );
    }

    return NextResponse.json({ text: output });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unexpected server error.",
      },
      { status: 500 },
    );
  }
}
