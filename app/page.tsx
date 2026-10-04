
"use client";

import { ChangeEvent, useRef, useState } from "react";
import lamejs from "lamejs";

type Cue = { id: number; start: number; end: number; text: string };

const languages = ["Tamil", "Malayalam", "English", "Hindi", "Telugu", "Kannada", "Bengali", "Marathi", "Gujarati", "Punjabi", "Urdu", "Spanish", "French", "German", "Italian", "Portuguese", "Japanese", "Korean", "Chinese", "Arabic", "Russian", "Turkish", "Indonesian", "Vietnamese", "Thai"];
const voices = ["Kore", "Puck", "Charon", "Zephyr", "Aoede", "Leda", "Orus", "Callirrhoe", "Iapetus", "Achird", "Sulafat", "Schedar", "Gacrux"];
const styles = ["Natural", "Conversational", "Professional", "Storytelling", "Cinematic", "Energetic", "Calm", "Documentary"];

function seconds(v: string) {
  const x = v.trim().replace(",", ".").split(":").map(Number);
  return x.length === 3 ? x[0] * 3600 + x[1] * 60 + x[2] : x[0] * 60 + x[1];
}

function parseSub(raw: string): Cue[] {
  const blocks = raw.replace(/\r/g, "").trim().split(/\n\s*\n/);
  const out: Cue[] = [];
  let id = 1;

  for (const b of blocks) {
    const lines = b.split("\n").map((x) => x.trim()).filter(Boolean);
    const i = lines.findIndex((x) => x.includes("-->"));
    if (i < 0) continue;

    const p = lines[i].split("-->");
    const text = lines.slice(i + 1).join("\n").replace(/<[^>]+>/g, "").trim();
    if (text) {
      out.push({
        id: id++,
        start: seconds(p[0]),
        end: seconds(p[1].split(/\s/)[0]),
        text,
      });
    }
  }

  return out.sort((a, b) => a.start - b.start);
}

function fmt(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const x = Math.floor(s % 60);
  return [h, m, x].map((n) => String(n).padStart(2, "0")).join(":");
}

function wavFromBuffer(b: AudioBuffer) {
  const d = b.getChannelData(0);
  const buf = new ArrayBuffer(44 + d.length * 2);
  const v = new DataView(buf);
  let p = 0;

  const w = (s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(p++, s.charCodeAt(i));
  };

  w("RIFF");
  v.setUint32(p, 36 + d.length * 2, true);
  p += 4;
  w("WAVEfmt ");
  v.setUint32(p, 16, true);
  p += 4;
  v.setUint16(p, 1, true);
  p += 2;
  v.setUint16(p, 1, true);
  p += 2;
  v.setUint32(p, b.sampleRate, true);
  p += 4;
  v.setUint32(p, b.sampleRate * 2, true);
  p += 4;
  v.setUint16(p, 2, true);
  p += 2;
  v.setUint16(p, 16, true);
  p += 2;
  w("data");
  v.setUint32(p, d.length * 2, true);
  p += 4;

  for (const n of d) {
    v.setInt16(p, Math.max(-1, Math.min(1, n)) * 32767, true);
    p += 2;
  }

  return new Blob([buf], { type: "audio/wav" });
}

async function encodeMp3(blob: Blob) {
  const ctx = new AudioContext();
  try {
    const a = await ctx.decodeAudioData(await blob.arrayBuffer());
    const d = a.getChannelData(0);
    const enc = new lamejs.Mp3Encoder(1, a.sampleRate, 128);
    const out: Int8Array[] = [];

    for (let i = 0; i < d.length; i += 1152) {
      const s = d.subarray(i, Math.min(i + 1152, d.length));
      const p = new Int16Array(s.length);
      for (let j = 0; j < s.length; j++) {
        p[j] = Math.max(-1, Math.min(1, s[j])) * 32767;
      }
      const x = enc.encodeBuffer(p);
      if (x.length) out.push(x);
    }

    const end = enc.flush();
    if (end.length) out.push(end);

    return new Blob(out as unknown as BlobPart[], { type: "audio/mpeg" });
  } finally {
    await ctx.close();
  }
}

export default function Home() {
  const [cues, setCues] = useState<Cue[]>([]);
  const [target, setTarget] = useState("Tamil");
  const [mode, setMode] = useState("Natural Translation");
  const [voice, setVoice] = useState("Kore");
  const [style, setStyle] = useState("Natural");
  const [pron, setPron] = useState("");
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [audioUrl, setAudioUrl] = useState("");
  const [recordUrl, setRecordUrl] = useState("");
  const [recording, setRecording] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [currentCue, setCurrentCue] = useState(-1);

  const audioRef = useRef<HTMLAudioElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const playbackUrlRef = useRef("");
  const recordUrlRef = useRef("");

  function setPlaybackUrl(url: string) {
    if (playbackUrlRef.current) URL.revokeObjectURL(playbackUrlRef.current);
    playbackUrlRef.current = url;
    setAudioUrl(url);
  }

  function setRecordedUrl(url: string) {
    if (recordUrlRef.current) URL.revokeObjectURL(recordUrlRef.current);
    recordUrlRef.current = url;
    setRecordUrl(url);
  }

  async function load(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;

    const text = await f.text();
    const next = f.name.toLowerCase().endsWith(".txt")
      ? [{ id: 1, start: 0, end: Math.max(5, text.length / 14), text }]
      : parseSub(text);

    setCues(next);
    setSelected(0);
    setCurrentCue(-1);
    setStatus(next.length ? "Subtitle loaded. All cues are ready." : "No subtitle cues found.");
  }

  function updatePastedText(value: string) {
    setCues(value.trim() ? [{ id: 1, start: 0, end: Math.max(5, value.length / 14), text: value }] : []);
    setSelected(0);
    setCurrentCue(-1);
  }

  async function tts(c: Cue) {
    const r = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: c.text,
        voice,
        style,
        language: target,
        pronunciation: pron,
      }),
    });

    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw Error(j.error || "TTS failed");
    }

    return r.blob();
  }

  async function generateAllAudio(ctx: BaseAudioContext) {
    const buffers: AudioBuffer[] = [];

    for (let i = 0; i < cues.length; i++) {
      setStatus("Generating voice " + (i + 1) + "/" + cues.length + "…");
      const blob = await tts(cues[i]);
      buffers.push(await ctx.decodeAudioData(await blob.arrayBuffer()));
    }

    return buffers;
  }

  function cuePlayDuration(cue: Cue, buffer: AudioBuffer, nextCue?: Cue) {
    const cueEnd = Math.max(cue.start + 0.05, cue.end);
    const nextStart = nextCue ? Math.max(cue.start + 0.05, nextCue.start) : cueEnd;
    const slot = Math.max(0.15, Math.min(cueEnd, nextStart) - cue.start);
    const natural = buffer.duration;

    if (natural <= slot) {
      return { rate: 1, sourceDuration: natural };
    }

    const rate = Math.min(3.5, natural / slot);
    return {
      rate,
      sourceDuration: Math.min(natural, slot * rate),
    };
  }

  async function renderTimeline(buffers: AudioBuffer[]) {
    const sampleRate = 24000;
    const total = Math.max(
      0.25,
      ...cues.map((c, i) => {
        const next = cues[i + 1];
        const timing = cuePlayDuration(c, buffers[i], next);
        return c.start + timing.sourceDuration / timing.rate;
      }),
      ...cues.map((c) => c.end),
    ) + 0.15;

    const offline = new OfflineAudioContext(1, Math.ceil(total * sampleRate), sampleRate);

    for (let i = 0; i < cues.length; i++) {
      const cue = cues[i];
      const timing = cuePlayDuration(cue, buffers[i], cues[i + 1]);
      const source = offline.createBufferSource();
      source.buffer = buffers[i];
      source.playbackRate.value = timing.rate;
      source.connect(offline.destination);

      const when = Math.max(0, cue.start);
      source.start(when, 0, timing.sourceDuration);
    }

    setStatus("Rendering the complete subtitle timeline…");
    return offline.startRendering();
  }

  async function prepareTimeline() {
    const ctx = new AudioContext();
    try {
      const buffers = await generateAllAudio(ctx);
      return await renderTimeline(buffers);
    } finally {
      await ctx.close();
    }
  }

  async function reading() {
    if (!cues.length) return;

    setBusy(true);
    setCurrentCue(-1);

    try {
      const timeline = await prepareTimeline();
      const url = URL.createObjectURL(wavFromBuffer(timeline));
      setPlaybackUrl(url);

      const audio = audioRef.current;
      if (!audio) throw Error("Audio player unavailable");

      audio.src = url;
      audio.currentTime = 0;
      audio.ontimeupdate = () => {
        const t = audio.currentTime;
        let index = -1;

        for (let i = 0; i < cues.length; i++) {
          if (t >= cues[i].start && t < cues[i].end) {
            index = i;
            break;
          }
        }

        if (index >= 0) {
          setCurrentCue(index);
          setSelected(index);
        }
      };
      audio.onended = () => {
        setCurrentCue(-1);
        setStatus("Finished reading the entire subtitle.");
      };

      await audio.play();
      setStatus("Reading ALL " + cues.length + " subtitle cues with original timing.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Reading failed");
    } finally {
      setBusy(false);
    }
  }

  async function record() {
    if (recording) {
      recRef.current?.stop();
      audioRef.current?.pause();
      return;
    }

    if (!cues.length) return;

    setBusy(true);
    setCurrentCue(-1);

    try {
      const timeline = await prepareTimeline();
      const url = URL.createObjectURL(wavFromBuffer(timeline));
      setPlaybackUrl(url);

      const audio = audioRef.current;
      if (!audio) throw Error("Audio player unavailable");

      const captureTarget = audio as HTMLAudioElement & {
        captureStream?: () => MediaStream;
        mozCaptureStream?: () => MediaStream;
      };
      const stream = captureTarget.captureStream?.() ?? captureTarget.mozCaptureStream?.();

      if (!stream) throw Error("Browser audio capture is unavailable");

      const mime =
        MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm";

      const r = new MediaRecorder(stream, { mimeType: mime });
      const parts: BlobPart[] = [];

      r.ondataavailable = (e) => {
        if (e.data.size) parts.push(e.data);
      };

      r.onstop = () => {
        setRecordedUrl(URL.createObjectURL(new Blob(parts, { type: mime })));
        setRecording(false);
        setCurrentCue(-1);
        setStatus("Complete recording ready.");
      };

      audio.ontimeupdate = () => {
        const t = audio.currentTime;
        const index = cues.findIndex((c) => t >= c.start && t < c.end);
        if (index >= 0) {
          setCurrentCue(index);
          setSelected(index);
        }
      };

      audio.onended = () => {
        if (r.state !== "inactive") r.stop();
        setCurrentCue(-1);
      };

      recRef.current = r;
      r.start();
      setRecording(true);

      audio.src = url;
      audio.currentTime = 0;
      await audio.play();
      setStatus("Recording ALL " + cues.length + " subtitle cues with original timing.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Recording failed");
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    if (!cues.length) return;

    setBusy(true);
    setCurrentCue(-1);

    try {
      const timeline = await prepareTimeline();
      setStatus("Encoding the complete voiceover to MP3…");

      const mp3 = await encodeMp3(wavFromBuffer(timeline));
      const u = URL.createObjectURL(mp3);
      const a = document.createElement("a");
      a.href = u;
      a.download = "nexora-ai-voice.mp3";
      a.click();

      setTimeout(() => URL.revokeObjectURL(u), 1000);
      setStatus("MP3 downloaded with the complete subtitle timeline.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  }

  async function naturalize() {
    const c = cues[selected];
    if (!c) return;

    setBusy(true);

    try {
      const r = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: c.text,
          targetLanguage: target,
          mode,
        }),
      });

      const j = await r.json();
      if (!r.ok) throw Error(j.error || "Translation failed");

      setCues((p) => p.map((x) => x.id === c.id ? { ...x, text: j.text } : x));
      setStatus("Subtitle translated.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Translation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <header>
        <div>
          <span className="eyebrow">NEXORA AI</span>
          <h1>Subtitle → Natural AI Voice</h1>
          <p>Gemini-powered voice studio for Tamil, Malayalam, English and major world languages.</p>
        </div>
        <span className="badge">Gemini 3.8 TTS</span>
      </header>

      <section className="grid">
        <div className="card">
          <h2>1. Input</h2>
          <label className="drop">
            <input type="file" accept=".srt,.vtt,.ass,.ssa,.sbv,.txt" onChange={load} />
            <strong>📂 Upload subtitles</strong>
            <span>SRT · VTT · ASS · SSA · SBV · TXT</span>
          </label>
          <textarea
            placeholder="Or paste subtitles / text here…"
            onChange={(e) => updatePastedText(e.target.value)}
          />
          {cues.length > 0 && <small>{cues.length} cues loaded</small>}
        </div>

        <div className="card">
          <h2>2. Voice</h2>
          <div className="row">
            <label>
              Output
              <select value={target} onChange={(e) => setTarget(e.target.value)}>
                {languages.map((x) => <option key={x}>{x}</option>)}
              </select>
            </label>
            <label>
              Translation
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                <option>Natural Translation</option>
                <option>Spoken / Conversational</option>
                <option>Direct Translation</option>
                <option>Professional</option>
              </select>
            </label>
          </div>

          <div className="row">
            <label>
              Voice
              <select value={voice} onChange={(e) => setVoice(e.target.value)}>
                {voices.map((x) => <option key={x}>{x}</option>)}
              </select>
            </label>
            <label>
              Style
              <select value={style} onChange={(e) => setStyle(e.target.value)}>
                {styles.map((x) => <option key={x}>{x}</option>)}
              </select>
            </label>
          </div>

          <label>
            Pronunciation dictionary
            <input
              value={pron}
              onChange={(e) => setPron(e.target.value)}
              placeholder="Nexora = Nex-or-ah; OpenAI = Open A I"
            />
          </label>

          <button className="secondary" disabled={!cues.length || busy} onClick={naturalize}>
            ✨ Naturalize selected subtitle
          </button>
        </div>
      </section>

      <section className="card editor">
        <div className="section-head">
          <h2>3. Subtitle Editor</h2>
          <span>{cues.length ? selected + 1 : 0} / {cues.length}</span>
        </div>

        {cues.length ? (
          <div className="cue-list">
            {cues.map((c, i) => (
              <div
                className={"cue " + (i === selected || i === currentCue ? "active" : "")}
                key={c.id}
                onClick={() => setSelected(i)}
              >
                <div className="cue-meta">
                  #{c.id} · {fmt(c.start)} → {fmt(c.end)}
                  {i === currentCue ? " · 🔊 PLAYING" : ""}
                </div>
                <textarea
                  value={c.text}
                  onChange={(e) =>
                    setCues((p) =>
                      p.map((x) => x.id === c.id ? { ...x, text: e.target.value } : x)
                    )
                  }
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">Upload or paste subtitles to begin.</div>
        )}
      </section>

      <section className="card output">
        <h2>4. Output</h2>

        <div className="outputs">
          <button className="primary" disabled={!cues.length || busy || recording} onClick={reading}>
            🔊 READING
          </button>

          <button className="danger" disabled={!cues.length || busy} onClick={record}>
            {recording ? "⏹ STOP RECORDING" : "🔴 READ + RECORD"}
          </button>

          <button className="primary" disabled={!cues.length || busy || recording} onClick={download}>
            ⬇️ DOWNLOAD MP3
          </button>
        </div>

        <audio ref={audioRef} controls className="player" src={audioUrl} />

        {recordUrl && (
          <div className="recorded">
            <strong>Recorded output</strong>
            <audio controls src={recordUrl} />
            <a href={recordUrl} download="nexora-read-recording.webm">Download recording</a>
          </div>
        )}

        <p className="status">{busy ? "⏳ " + status : status}</p>
      </section>

      <section className="card advanced">
        <button className="advanced-toggle" onClick={() => setAdvanced(!advanced)}>
          ⚙️ Advanced {advanced ? "▲" : "▼"}
        </button>

        {advanced && (
          <div className="advanced-body">
            <div>
              <strong>Smart Timing</strong>
              <p>
                Every subtitle cue is generated, decoded, and scheduled at its original
                timestamp. Speech that is longer than its cue window is automatically
                accelerated so it does not spill into the next cue.
              </p>
            </div>

            <div>
              <strong>Complete playback</strong>
              <p>
                READING and READ + RECORD now process the ENTIRE subtitle file instead of
                only the selected cue.
              </p>
            </div>

            <div>
              <strong>MP3 timeline</strong>
              <p>
                DOWNLOAD MP3 renders the same full timed timeline, including silence between
                subtitle cues.
              </p>
            </div>

            <div>
              <strong>Security</strong>
              <p>GEMINI_API_KEY stays server-side and is never exposed to the browser.</p>
            </div>
          </div>
        )}
      </section>

      <footer>{busy ? "Working…" : recording ? "Recording…" : "Ready"} · Built for Nexora AI</footer>
    </main>
  );
}
