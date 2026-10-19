# Narration for demo-v5 via Edge TTS (no API key needed).
# Each line: [preferred start offset in ms, text] — the assembly script
# re-times these to be strictly sequential (no overlap, v4 lesson).
$ErrorActionPreference = "Stop"
$TTS = @("py", "-3.12", "-m", "edge_tts")
$VOICE = "en-US-ChristopherNeural"
$OUT = Join-Path $PSScriptRoot "narration-v5"
New-Item -ItemType Directory -Force -Path $OUT | Out-Null

$LINES = @(
  @(3500,   "This is the Open Personal Agent. An agent you run yourself, that actually does things. It calls businesses, logs into sites, builds its own panels, and thinks a step ahead. All behind approvals you control."),
  @(19500,  "Getting it running takes one command. Clone the repo, npm install, set your Anthropic key, npm run dev. It comes up on local host five thousand with seeded data, so every feature works before you connect a single account."),
  @(36500,  "The README is the full guide. Real providers behind the same interfaces: Twilio for S M S, WhatsApp, and voice calls. Mailgun for email. ElevenLabs for voice. Postgres when you outgrow SQLite. And a Dockerfile for deploys."),
  @(56000,  "Here's the part most assistants don't do. It thinks ahead. A flight inside three days surfaces check-in and the airport run. A dinner reservation gets a one tap button: call to confirm."),
  @(70000,  "One tap, a tier two approval card, and the agent dials. It opens with an A I disclosure, because the policy requires it. The transcript lands in the Data tab. Audio is never recorded."),
  @(82500,  "Now the core loop. Teach it a fact and it lands in memory you own, with provenance."),
  @(90000,  "Ask for a flight and the provider layer returns real offers. Booking is tier three, money moving. The agent stops and asks first."),
  @(98500,  "Approve, and a signed mandate pays with a single use card capped at the fare. Then it lands on your calendar."),
  @(108000, "Ask for a panel and it builds one. Fixed widget types bound to real store data, no generated code. A dashboard from a sentence."),
  @(118000, "Save a login in the vault and the agent can type it into its own browser. Tier three, always with approval. Passwords are encrypted at rest, never in tool parameters, never shown to the model."),
  @(131000, "When a site needs real interaction, there's a tier three browser rung. Real Chromium navigates on the server. The Browser tab streams it live. Click in to take over. The kill switch revokes instantly."),
  @(166000, "Talk to it instead of typing. Speech in, spoken replies out. Memory you own: provenance, O M F export, delete. Connect Google Calendar and Gmail and the samples become real data."),
  @(186000, "To build your own on this, three places matter. The risk policy tiers every action zero through three. Unmatched actions fail closed."),
  @(202000, "Tools dot tee ess is the capability contract: a name, an input schema, a prepare step the policy engine reads, and the executor that runs it."),
  @(216000, "Providers swap samples for real accounts. The Google provider is the reference: OAuth, refresh tokens encrypted at rest, a local mirror so the U I stays fast. Add yours the same way."),
  @(238000, "Open Personal Agent. Open source. Your data, your keys, your rules.")
)

for ($i = 0; $i -lt $LINES.Count; $i++) {
  $file = Join-Path $OUT ("line-{0:d2}.mp3" -f ($i + 1))
  & $TTS[0] $TTS[1] $TTS[2] $TTS[3] --voice $VOICE --text $LINES[$i][1] --write-media $file 2>$null | Out-Null
  if (!(Test-Path $file) -or (Get-Item $file).Length -lt 1000) { Write-Error "line $($i+1) failed"; exit 1 }
  Write-Output ("line-{0:d2}.mp3  @{1}ms" -f ($i + 1), $LINES[$i][0])
}
Write-Output "done"
