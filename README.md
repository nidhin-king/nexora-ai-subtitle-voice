# Nexora AI — Subtitle → Natural AI Voice

Next.js app for turning subtitle cues into natural Gemini speech.

Core outputs: Reading, Read + Record, Download MP3.

Features: SRT/VTT/ASS/SSA/SBV/TXT input, Tamil/Malayalam/English and major languages, natural translation, Gemini 3.8 Flash TTS, voice/style selection, subtitle editor, pronunciation dictionary, timeline placement, browser recording and client-side MP3 encoding.

## Setup
Create `.env.local` with `GEMINI_API_KEY=your_key`, then run `npm install` and `npm run dev`.

Deploy to Vercel and add `GEMINI_API_KEY` to the project environment variables.

The Gemini TTS model is `gemini-3.8-flash-tts.`
