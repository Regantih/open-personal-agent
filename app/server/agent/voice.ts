// Voice lane: server-side ElevenLabs TTS. Speech-to-text runs in the browser
// (Web Speech API), the spoken text flows through the normal turn pipeline,
// and the reply is synthesized here so the API key never touches the client.
// Set ELEVENLABS_API_KEY; ELEVENLABS_VOICE picks the voice (default: Brian —
// the same narration voice used in the demo video).

const ELEVEN_MODEL = "eleven_multilingual_v2";
const DEFAULT_VOICE = "ThT5KcBeYPX3keUQqHPh"; // Brian

export function ttsConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

export async function synthesize(text: string): Promise<Buffer> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY not set");
  const voice = process.env.ELEVENLABS_VOICE || DEFAULT_VOICE;
  const trimmed = text.slice(0, 4000); // hard cap; long answers get truncated politely
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ text: trimmed, model_id: ELEVEN_MODEL, voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 1.0 } }),
  });
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return Buffer.from(await r.arrayBuffer());
}
