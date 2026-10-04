import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MODEL = "gemini-3.8-flash-tts";
const API = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

function pcmToWav(pcm: Buffer, rate = 24000, channels = 1) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export async function POST(req: Request) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return NextResponse.json({ error: "GEMINI_API_KEY is not configured." }, { status: 500 });

  try {
    const body = await req.json();
    const text = String(body.text ?? "").trim();
    const voice = String(body.voice ?? "Kore");
    const style = String(body.style ?? "Natural");
    const language = String(body.language ?? "Auto Detect");
    const pronunciation = String(body.pronunciation ?? "").trim();

    if (!text) return NextResponse.json({ error: "Text is required." }, { status: 400 });
    if (text.length > 7000) return NextResponse.json({ error: "Keep each generation under 7,000 characters." }, { status: 400 });

    const prompt = [
      `Read this text naturally in ${language}.`,
      `Voice style: ${style}.`,
      "Use a natural conversational cadence, accurate pronunciation, appropriate pauses, and clear articulation.",
      "Do not translate or paraphrase the text. Speak the supplied text exactly.",
      pronunciation ? `Pronunciation dictionary: ${pronunciation}` : "",
      `Transcript:\n\n${text}`,
    ].filter(Boolean).join("\n\n");

    const response = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
      }),
      cache: "no-store",
    });

    const data = await response.json();
    if (!response.ok) return NextResponse.json({ error: data?.error?.message || "Gemini TTS request failed." }, { status: response.status });

    const inlineData = data?.candidates?.[0]?.content?.parts?.find((part: any) => part?.inlineData?.data)?.inlineData;
    if (!inlineData?.data) return NextResponse.json({ error: "Gemini returned no audio." }, { status: 502 });

    const raw = Buffer.from(inlineData.data, "base64");
    const wav = pcmToWav(raw, 24000, 1);
    return new NextResponse(wav as BodyInit, {
      headers: {
        "Content-Type": "audio/wav",
        "Content-Disposition": "inline; filename=nexora-voice.wav",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unexpected server error." }, { status: 500 });
  }
}
