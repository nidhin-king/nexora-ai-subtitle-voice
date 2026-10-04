import { NextResponse } from "next/server";
export const runtime = "nodejs";
const MODEL = "gemini-3.8-flash";
const API = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
export async function POST(req: Request) {
 const key = process.env.GEMINI_API_KEY;
 if (!key) return NextResponse.json({error:"GEMINI_API_KEY is not configured."},{status:500});
 try {
  const b=await req.json(); const text=String(b.text??"").trim(); const targetLanguage=String(b.targetLanguage??"").trim(); const mode=String(b.mode??"Natural Translation");
  if(!text||!targetLanguage) return NextResponse.json({error:"Text and target language are required."},{status:400});
  if(text.length>7000) return NextResponse.json({error:"Keep each translation under 7,000 characters."},{status:400});
  const prompt=`Translate the subtitle into ${targetLanguage}. Mode: ${mode}. Preserve meaning, names, numbers, technical terms and emotional intent. For Tamil or Malayalam, prefer natural spoken language used by native speakers rather than literal textbook translation. Return only the translated subtitle text, with no explanation.\n\nSOURCE:\n${text}`;
  const r=await fetch(API,{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},body:JSON.stringify({contents:[{parts:[{text:prompt}]}]}),cache:"no-store"});
  const d=await r.json();
  if(!r.ok) return NextResponse.json({error:d?.error?.message||"Translation failed."},{status:r.status});
  const out=d?.candidates?.[0]?.content?.parts?.map((p:any)=>p?.text||"").join("").trim();
  if(!out) return NextResponse.json({error:"Gemini returned no translation."},{status:502});
  return NextResponse.json({text:out});
 } catch(e) { return NextResponse.json({error:e instanceof Error?e.message:"Unexpected server error."},{status:500}); }
}
