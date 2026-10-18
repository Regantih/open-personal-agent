# Synthesize narration lines to narration/line-XX.wav
# Usage: powershell -File narrate.ps1
param([int]$Rate = 1)

Add-Type -AssemblyName System.Speech
$out = Join-Path $PSScriptRoot 'narration'
New-Item -ItemType Directory -Force -Path $out | Out-Null

$lines = @(
  @{ at = 300;    text = "This is Open Personal Agent. A personal agent you can text. It asks before it spends money, or acts as you." },
  @{ at = 8500;   text = "Getting started is one command. npm install, npm run dev. It answers in the browser, and by SMS or email." },
  @{ at = 18000;  text = "First, teach it. Remember: aisle seats on flights over two hours." },
  @{ at = 24000;  text = "Preferences become memory you own. Exportable, importable, and deletable as Open Memory Format." },
  @{ at = 40500;  text = "A cheaper background model watches your day, and proposes one-tap actions." },
  @{ at = 51000;  text = "Tap one. Reply to Priya. Sending as you needs approval: tap approve, or text A-P-P-R-O-V-E plus the code." },
  @{ at = 66500;  text = "Ask it to triage the inbox. It flags the prompt-injection email instead of obeying it." },
  @{ at = 81500;  text = "Now book a refundable flight. It queued the wrong fare first, caught itself, and re-queued the right one." },
  @{ at = 92000;  text = "Every action waits on a signed approval, bound to the amount and the merchant." },
  @{ at = 104000; text = "Approved by text. Booked with a single-use card capped at four hundred nine dollars. The mistaken fare? Blocked by the daily spend cap, even after approval." },
  @{ at = 118000; text = "And stop everything freezes it, from anywhere." },
  @{ at = 123000; text = "Open source. Your data, your keys, your rules." }
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
