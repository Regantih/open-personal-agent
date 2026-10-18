// Generate narration via ElevenLabs TTS -> narration-el/line-XX.mp3
// Usage: ELEVENLABS_API_KEY=sk_... node narrate-elevenlabs.js
const fs = require("fs");
const path = require("path");

const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) { console.error("set ELEVENLABS_API_KEY"); process.exit(1); }

// Brian - deep narration voice
const VOICE = process.env.ELEVENLABS_VOICE || "nPczCjzI2devNBz1zQrb";
const MODEL = process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2";

const LINES = [
  [300,    "This is Open Personal Agent. A personal agent you can text. It asks before it spends money, or acts as you."],
  [8500,   "One command starts it: npm install, npm run dev. It answers in the browser, by S-M-S, or by email."],
  [18000,  "First, teach it something about you. Remember: aisle seats on flights over two hours."],
  [26000,  "That becomes memory you own. Exportable in Open Memory Format."],
  [39500,  "A cheaper background lane watches your day, and proposes one-tap actions."],
  [46500,  "Tap one: reply to Priya. Acting as you needs approval."],
  [57500,  "Approve in the app, or just text A-P-P-R-O-V-E and the code. It executes under a signed mandate."],
  [68000,  "Blocking focus time is instant. No approval needed for reversible holds."],
  [80000,  "It audits subscriptions, finds the waste, and asks before cancelling. Four hundred sixty eight dollars a year, saved."],
  [100500, "Ask it to handle the inbox, and it flags a prompt-injection email instead of obeying it."],
  [121500, "Booking a flight waits on a signed approval, bound to the amount and the merchant."],
  [136500, "Approved by text. Booked with a single-use card, capped at four hundred nine dollars."],
  [149500, "Stop everything pauses it from anywhere. Reads still work; writes are frozen."],
  [159500, "Open source. Your data, your keys, your rules."],
];

const out = path.join(__dirname, "narration-el");
fs.mkdirSync(out, { recursive: true });

(async () => {
  for (let i = 0; i < LINES.length; i++) {
    const [, text] = LINES[i];
    const file = path.join(out, `line-${String(i + 1).padStart(2, "0")}.mp3`);
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: MODEL,
        voice_settings: { stability: 0.55, similarity_boost: 0.75, use_speaker_boost: true },
      }),
    });
    if (!res.ok) { console.error(`line ${i + 1} failed: ${res.status} ${await res.text()}`); process.exit(1); }
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    console.log(`line-${String(i + 1).padStart(2, "0")}.mp3  @${LINES[i][0]}ms`);
    await new Promise(r => setTimeout(r, 300)); // be nice to rate limits
  }
  console.log("done");
})();
