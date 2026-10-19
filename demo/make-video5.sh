#!/usr/bin/env bash
# Assemble demo-v5.mp4: narrated demo incl. the new lanes (anticipation->call,
# Panels, vault) plus quickstart, use-it, browser handoff, tour, code tour.
#   title(4) -> terminal(15) -> readme(20) -> rec10 anticipate+call(31)
#   -> rec7 use-it(41) -> rec11 panels(13) -> rec12 vault(13) -> rec5 browser(37)
#   -> rec6 tour(20) -> rec8 code(58) -> end(8) ~= 260s
# Narration delays are COMPUTED from real mp3 durations — strictly sequential.
set -e
cd "$(dirname "$0")"
FFMPEG="/c/Users/hrega/AppData/Local/Microsoft/WinGet/Links/ffmpeg"
FFPROBE="/c/Users/hrega/AppData/Local/Microsoft/WinGet/Links/ffprobe"
FONT="shots/arialbd.ttf"
OUT=build5
mkdir -p "$OUT"

REC5="rec5/page@a2a24408a1f895d6c65dead6a994b6e8.webm"
REC6="rec6/page@6014449035c7d6c9456ecaf83fa615cf.webm"
REC7=$(ls -t rec7/*.webm | head -1)
REC8="rec8/page@9076d54cadb7182116812ce5080fda6d.webm"
REC9=$(ls -t rec9/*.webm | head -1)
REC10=$(ls -t rec10/*.webm | head -1)
REC11=$(ls -t rec11/*.webm | head -1)
REC12=$(ls -t rec12/*.webm | head -1)

cap() {
  echo "drawbox=x=0:y=h-74:w=iw:h=74:color=black@0.72:t=fill:enable='between(t,$1,$2)',drawtext=fontfile=$FONT:text='$3':fontsize=26:fontcolor=white:x=20:y=h-50:enable='between(t,$1,$2)'"
}

# ---- cards: reuse the v4 title/terminal; regen a 10s end card ----
cp build4/00-title.mp4 "$OUT/00-title.mp4"
cp build4/01-terminal.mp4 "$OUT/01-terminal.mp4"
"$FFMPEG" -y -v error -f lavfi -i "color=0x0f1117:s=1440x900:d=10:r=30" -vf \
  "drawtext=fontfile=$FONT:text='Open source. Your data, your keys, your rules.':fontsize=40:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2-40,drawtext=fontfile=$FONT:text='github.com/Regantih/open-personal-agent':fontsize=28:fontcolor=0x9aa4b2:x=(w-text_w)/2:y=(h-text_h)/2+40" \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p "$OUT/99-end.mp4"

# ---- rec9: README scroll (20s) ----
"$FFMPEG" -y -v error -i "$REC9" -vf \
  "fps=30,scale=1440:900,$(cap 0 19 'the README is the full setup guide - providers, channels, Postgres, Docker')" \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -an "$OUT/02-readme.mp4"

# ---- rec10: anticipation -> action button -> T2 call -> transcript (31s) ----
"$FFMPEG" -y -v error -i "$REC10" -vf \
  "fps=30,scale=1440:900,$(cap 0.5 7 'it thinks ahead - the flight and the reservation both got follow-ups'),$(cap 8 13.5 'one tap - a T2 approval card before anything dials'),$(cap 14 20.5 'the agent calls - AI disclosure first, always'),$(cap 21.5 30.5 'transcript in the Data tab - audio is never recorded')" \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -an "$OUT/03-anticipate.mp4"

# ---- rec7: remember + flight + T3 approval (~23s) ----
"$FFMPEG" -y -v error -i "$REC7" -vf \
  "fps=30,scale=1440:900,$(cap 1 6 'teach it a fact - it lands in memory you own'),$(cap 7 11 'ask for a flight - the provider layer returns real offers'),$(cap 11.5 15.5 'booking is T3 - the agent stops and asks first'),$(cap 16 22 'approved - single-use card capped at the fare, on the calendar')" \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -an "$OUT/04-useit.mp4"

# ---- rec11: panels (13s) ----
"$FFMPEG" -y -v error -i "$REC11" -vf \
  "fps=30,scale=1440:900,$(cap 0.5 6 'say it in chat - build me a panel to track my money'),$(cap 6.5 13 'panels - fixed widgets on real store data, no generated code')" \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -an "$OUT/05-panels.mp4"

# ---- rec12: vault (13s) ----
"$FFMPEG" -y -v error -i "$REC12" -vf \
  "fps=30,scale=1440:900,$(cap 0.5 6 'the vault - logins the agent types into its own browser'),$(cap 6.5 13 'AES-256-GCM - never in tool params, never shown to the model')" \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -an "$OUT/06-vault.mp4"

# ---- rec5: browser handoff (37s) ----
"$FFMPEG" -y -v error -i "$REC5" -vf \
  "fps=30,scale=1440:900,$(cap 0 9 'hand it a browser - T3 approval first'),$(cap 10 22 'a real Chromium session navigates on the server'),$(cap 23 32 'the Browser tab streams live - click in to take over'),$(cap 32 37 'close anytime - the kill switch revokes instantly')" \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -an "$OUT/07-browser.mp4"

# ---- rec6: tour (20s) ----
"$FFMPEG" -y -v error -i "$REC6" -vf \
  "fps=30,scale=1440:900,$(cap 0 4.5 'talk to it - speech in, spoken replies out'),$(cap 6 10 'memory you own - provenance, OMF export, delete'),$(cap 10.5 20 'connect Google Calendar + Gmail - samples become real data')" \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -an "$OUT/08-tour.mp4"

# ---- rec8: code tour (58s) ----
"$FFMPEG" -y -v error -i "$REC8" -vf \
  "fps=30,scale=1440:900,$(cap 0 12 'the repo - README, deploy docs, everything open'),$(cap 12 24 'spec/risk-policy - every action tiered T0-T3, unmatched fails closed'),$(cap 24 37 'tools.ts - add a capability\: name, schema, prepare, execute'),$(cap 37 58 'providers/ - connect real accounts; Google is the reference')" \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -an "$OUT/09-code.mp4"

cat > "$OUT/list.txt" <<'EOF'
file '00-title.mp4'
file '01-terminal.mp4'
file '02-readme.mp4'
file '03-anticipate.mp4'
file '04-useit.mp4'
file '05-panels.mp4'
file '06-vault.mp4'
file '07-browser.mp4'
file '08-tour.mp4'
file '09-code.mp4'
file '99-end.mp4'
EOF
"$FFMPEG" -y -v error -f concat -safe 0 -i "$OUT/list.txt" -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p "$OUT/video-only.mp4"

# ---- narration: strictly sequential. delay = max(preferred, prev_end+0.4s) ----
N=narration-v5
# preferred starts (ms) — title 0-4, terminal 4-19, readme 19-39,
# rec10 39-70, rec7 70-92.7, rec11 92.7-105.9, rec12 105.9-119.3,
# rec5 119.3-156.3, rec6 156.3-176.3, rec8 176.3-234.3, end 234.3-244.3
PREF=(3500 19800 36400 47500 61900 77300 84300 95100 103500 114100 128100 156300 176300 187400 213500 235000)
NCOUNT=16
declare -a DELAY
prev=0
for i in $(seq 0 $((NCOUNT - 1))); do
  f=$(printf "%s/line-%02d.mp3" "$N" $((i + 1)))
  dur=$("$FFPROBE" -v error -show_entries format=duration -of csv=p=0 "$f")
  durms=$(awk "BEGIN{printf \"%d\", $dur * 1000}")
  start=${PREF[$i]}
  [ "$start" -lt "$((prev + 400))" ] && start=$((prev + 400))
  DELAY[$i]=$start
  prev=$((start + durms))
done
echo "narration ends at ~$((prev / 1000))s"
IN=""; FC=""
for i in $(seq 0 $((NCOUNT - 1))); do
  f=$(printf "%s/line-%02d.mp3" "$N" $((i + 1)))
  IN="$IN -i $f"
  FC="$FC[$i:a]adelay=${DELAY[$i]}|${DELAY[$i]}[a$i];"
done
MIX="$(for i in $(seq 0 $((NCOUNT - 1))); do echo -n "[a$i]"; done)amix=inputs=$NCOUNT:normalize=0[aout]"
"$FFMPEG" -y -v error $IN -filter_complex "$FC$MIX" -map "[aout]" -c:a libmp3lame -q:a 4 "$OUT/narration.mp3"
"$FFPROBE" -v error -show_entries format=duration -of csv=p=0 "$OUT/narration.mp3" | xargs echo "narration duration:"

"$FFMPEG" -y -v error -i "$OUT/video-only.mp4" -i "$OUT/narration.mp3" -c:v copy -c:a aac -b:a 160k demo-v5.mp4
"$FFPROBE" -v error -show_entries format=duration,size -of csv=p=0 demo-v5.mp4 | xargs echo "final:"
echo "done -> demo-v5.mp4"
