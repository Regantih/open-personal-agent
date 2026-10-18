# Synthesize narration lines to narration/line-XX.wav
# Usage: powershell -File narrate.ps1
param([int]$Rate = 1)

Add-Type -AssemblyName System.Speech
$out = Join-Path $PSScriptRoot 'narration'
New-Item -ItemType Directory -Force -Path $out | Out-Null
Get-ChildItem $out -Filter 'line-*.wav' -ErrorAction SilentlyContinue | Remove-Item -Force

$lines = @(
  @{ at = 300;    text = "This is Open Personal Agent. A personal agent you can text. It asks before it spends money, or acts as you." },
  @{ at = 8500;   text = "One command starts it: npm install, npm run dev. It answers in the browser, by S-M-S, or by email." },
  @{ at = 18000;  text = "First, teach it something about you. Remember: aisle seats on flights over two hours." },
  @{ at = 26000;  text = "That becomes memory you own. Exportable in Open Memory Format." },
  @{ at = 39500;  text = "A cheaper background lane watches your day, and proposes one-tap actions." },
  @{ at = 46500;  text = "Tap one: reply to Priya. Acting as you needs approval." },
  @{ at = 57500;  text = "Approve in the app, or just text A-P-P-R-O-V-E and the code. It executes under a signed mandate." },
  @{ at = 68000;  text = "Blocking focus time is instant. No approval needed for reversible holds." },
  @{ at = 80000;  text = "It audits subscriptions, finds the waste, and asks before cancelling. Four hundred sixty eight dollars a year, saved." },
  @{ at = 100500; text = "Ask it to handle the inbox, and it flags a prompt-injection email instead of obeying it." },
  @{ at = 121500; text = "Booking a flight waits on a signed approval, bound to the amount and the merchant." },
  @{ at = 136500; text = "Approved by text. Booked with a single-use card, capped at four hundred nine dollars." },
  @{ at = 149500; text = "Stop everything pauses it from anywhere. Reads still work; writes are frozen." },
  @{ at = 159500; text = "Open source. Your data, your keys, your rules." }
)

$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SelectVoice('Microsoft Zira Desktop')
$s.Rate = $Rate
$i = 0
foreach ($l in $lines) {
  $i++
  $f = Join-Path $out ("line-{0:d2}.wav" -f $i)
  $s.SetOutputToWaveFile($f)
  $s.Speak($l.text)
  Write-Output ("{0}  @{1}ms  {2}" -f $i, $l.at, $l.text.Substring(0, [Math]::Min(60, $l.text.Length)))
}
$s.SetOutputToNull()
$s.Dispose()
