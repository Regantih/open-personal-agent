# Narration for demo-v3 via Edge TTS (no API key needed).
# Each line: [start offset in ms into final video, text]
$ErrorActionPreference = "Stop"
$TTS = @("py", "-3.12", "-m", "edge_tts")
$VOICE = "en-US-ChristopherNeural"
$OUT = Join-Path $PSScriptRoot "narration-v3"
New-Item -ItemType Directory -Force -Path $OUT | Out-Null

$LINES = @(
  @(4000,  "This is Open Personal Agent. A personal agent you can text, email, or talk to. It asks before it spends money or acts as you. Here's how to run it, use it, and build your own on top of it."),
  @(20000, "Teach it something first. Remember, I prefer aisle seats. That becomes a durable fact in your memory, with provenance."),
  @(33000, "Now ask it to book a flight. It searches the provider layer for real offers, and picks the cheapest."),
  @(43000, "Booking is tier three. Money moving. The agent stops and asks: the carrier, the price, a four digit code. Nothing executes yet."),
  @(53000, "Approve in the app, or text A-P-P-R-O-V-E plus the code. A signed mandate, bound to that amount and merchant, is verified before the booking runs. Paid with a single use card, capped at the fare."),
  @(68000, "The bigger move: hand it a browser. Tier three again, approval first. Then a real Chromium session opens on the server and navigates for you."),
  @(83000, "The Browser tab streams the agent's view live. Click into it to take over. Log in yourself. The agent sees the page, never your credentials."),
  @(96000, "Close it anytime. And the kill switch revokes sessions instantly."),
  @(103000, "Talk to it instead of typing. Speech in, spoken replies out. Your memory stays yours: every fact carries provenance and exports in Open Memory Format."),
  @(114000, "Connect real accounts when you're ready. Google Calendar and Gmail replace the sample data the moment you link them."),
  @(122000, "To build your own agent on this, three files matter. The risk policy declares every action's tier, zero through three. Unmatched actions fail closed."),
  @(137000, "Tools dot tee ess is where capabilities live: a name, an input schema, a prepare step the policy engine reads to compute the risk, and the executor that runs it."),
  @(150000, "Providers connect real accounts. The Google provider is the reference: OAuth, refresh tokens encrypted at rest, and a local mirror so the UI stays fast. Add yours the same way."),
  @(160000, "Open source. Your data, your keys, your rules. Clone it and make it yours.")
)

for ($i = 0; $i -lt $LINES.Count; $i++) {
  $file = Join-Path $OUT ("line-{0:d2}.mp3" -f ($i + 1))
  & $TTS[0] $TTS[1] $TTS[2] $TTS[3] --voice $VOICE --text $LINES[$i][1] --write-media $file 2>$null | Out-Null
  if (!(Test-Path $file) -or (Get-Item $file).Length -lt 1000) { Write-Error "line $($i+1) failed"; exit 1 }
  Write-Output ("line-{0:d2}.mp3  @{1}ms" -f ($i + 1), $LINES[$i][0])
}
Write-Output "done"
