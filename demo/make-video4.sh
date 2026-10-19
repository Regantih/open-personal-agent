#!/usr/bin/env bash
# Assemble demo-v4.mp4: narrated demo incl. "run it yourself" quickstart.
#   title(4s) -> terminal card(15s) -> rec9 README(20s) -> rec7 use-it(41s)
#   -> rec5 browser(37s) -> rec6 tour(20s) -> rec8 code(58s) -> end(8s) ~= 203s
set -e
cd "$(dirname "$0")"
FFMPEG="/c/Users/hrega/AppData/Local/Microsoft/WinGet/Links/ffmpeg"
FFPROBE="/c/Users/hrega/AppData/Local/Microsoft/WinGet/Links/ffprobe"
FONT="shots/arialbd.ttf"
MONO="shots/consola.ttf"
REC5="rec5/page@a2a24408a1f895d6c65dead6a994b6e8.webm"
REC6="rec6/page@6014449035c7d6c9456ecaf83fa615cf.webm"
REC7="rec7/page@92ec8c7ff6f3ac6f4468de43a1bda934.webm"
REC8="rec8/page@9076d54cadb7182116812ce5080fda6d.webm"
REC9=$(ls -t rec9/*.webm | head -1)
OUT=build4
mkdir -p "$OUT"

cap() {
  echo "drawbox=x=0:y=h-74:w=iw:h=74:color=black@0.72:t=fill:enable='between(t,$1,$2)',drawtext=fontfile=$FONT:text='$3':fontsize=26:fontcolor=white:x=20:y=h-50:enable='between(t,$1,$2)'"
}

# ---- title + end cards ----
"$FFMPEG" -y -v error -f lavfi -i "color=0x0f1117:s=1440x900:d=4:r=30" -vf \
  "drawtext=fontfile=$FONT:text='Open Personal Agent':fontsize=72:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2-80,drawtext=fontfile=$FONT:text='run it. use it. build your own on it.':fontsize=30:fontcolor=0x9aa4b2:x=(w-text_w)/2:y=(h-text_h)/2+10,drawtext=fontfile=$FONT:text='github.com/Regantih/open-personal-agent':fontsize=24:fontcolor=0x6b7280:x=(w-text_w)/2:y=h-100" \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p "$OUT/00-title.mp4"
"$FFMPEG" -y -v error -f lavfi -i "color=0x0f1117:s=1440x900:d=8:r=30" -vf \
  "drawtext=fontfile=$FONT:text='Open source. Your data, your keys, your rules.':fontsize=40:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2-40,drawtext=fontfile=$FONT:text='github.com/Regantih/open-personal-agent':fontsize=28:fontcolor=0x9aa4b2:x=(w-text_w)/2:y=(h-text_h)/2+40" \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p "$OUT/99-end.mp4"

# ---- terminal card: real commands + real boot output, typed reveal ----
TERM_LINES=(
  '\$ git clone https\://github.com/Regantih/open-personal-agent'
  '\$ cd open-personal-agent/app \&\& npm install'
  '\$ export ANTHROPIC_API_KEY=sk-ant-...'
  '\$ npm run dev'
  '[opa] policy loaded - planner + fast lanes - inline orchestrator'
  '[opa] listening on http\://localhost\:5000'
)
REVEAL=(0.5 2.5 5 7.5 10 12)
TF=""
for i in 0 1 2 3 4 5; do
  color="0x7ee787"; [ "$i" -ge 4 ] && color="0x9aa4b2"
  TF="$TF,drawtext=fontfile=$MONO:text='${TERM_LINES[$i]}':fontsize=30:fontcolor=$color:x=70:y=$((300 + i * 56)):enable='gte(t,${REVEAL[$i]})'"
done
"$FFMPEG" -y -v error -f lavfi -i "color=0x0d1117:s=1440x900:d=15:r=30" -vf \
  "drawbox=x=40:y=230:w=1360:h=420:color=0x161b22:t=fill,drawbox=x=40:y=230:w=1360:h=40:color=0x21262d:t=fill,drawtext=fontfile=$MONO:text='powershell - open-personal-agent':fontsize=20:fontcolor=0x8b949e:x=60:y=240${TF}" \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p "$OUT/01-terminal.mp4"

# ---- rec9: README scroll ----
"$FFMPEG" -y -v error -i "$REC9" -vf \
  "fps=30,scale=1440:900,$(cap 0 19 'the README is the full setup guide - keys, channels, Postgres, Docker')" \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -an "$OUT/02-readme.mp4"

# ---- rec7: remember + flight + T3 approval (41s) ----
"$FFMPEG" -y -v error -i "$REC7" -vf \
  "fps=30,scale=1440:900,$(cap 0 9 'teach it a fact - it lands in memory you own'),$(cap 14 24 'ask for a flight - the provider layer returns real offers'),$(cap 25 33 'booking is T3 - the agent stops and asks first'),$(cap 33 41 'approved - single-use card capped at the fare, added to calendar')" \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -an "$OUT/03-useit.mp4"

# ---- rec5: browser handoff (37s) ----
"$FFMPEG" -y -v error -i "$REC5" -vf \
  "fps=30,scale=1440:900,$(cap 0 9 'hand it a browser - T3 approval first'),$(cap 10 22 'a real Chromium session navigates on the server'),$(cap 23 32 'the Browser tab streams live - click in to take over'),$(cap 32 37 'close anytime - the kill switch revokes instantly')" \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -an "$OUT/04-browser.mp4"

# ---- rec6: tour (20s) ----
"$FFMPEG" -y -v error -i "$REC6" -vf \
  "fps=30,scale=1440:900,$(cap 0 4.5 'talk to it - speech in, spoken replies out'),$(cap 6 10 'memory you own - provenance, OMF export, delete'),$(cap 10.5 20 'connect Google Calendar + Gmail - samples become real data')" \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -an "$OUT/05-tour.mp4"

# ---- rec8: code tour (58s) ----
"$FFMPEG" -y -v error -i "$REC8" -vf \
  "fps=30,scale=1440:900,$(cap 0 12 'the repo - README, deploy docs, everything open'),$(cap 12 24 'spec/risk-policy - every action tiered T0-T3, unmatched fails closed'),$(cap 24 37 'tools.ts - add a capability\: name, schema, prepare, execute'),$(cap 37 58 'providers/ - connect real accounts; Google is the reference')" \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -an "$OUT/06-code.mp4"

cat > "$OUT/list.txt" <<'EOF'
file '00-title.mp4'
file '01-terminal.mp4'
file '02-readme.mp4'
file '03-useit.mp4'
file '04-browser.mp4'
file '05-tour.mp4'
file '06-code.mp4'
file '99-end.mp4'
EOF
"$FFMPEG" -y -v error -f concat -safe 0 -i "$OUT/list.txt" -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p "$OUT/video-only.mp4"

# ---- narration ----
N=narration-v3
# order: 01 intro, 15 quickstart, 16 readme, 02 remember, 03 flight, 04 T3,
#        05 approve, 06 browser, 07 liveview, 08 close, 09 voice/memory,
#        10 connections, 11 policy, 12 tools, 13 providers, 14 end
FILES=(01 15 16 02 03 04 05 06 07 08 09 10 11 12 13 14)
# sequential, non-overlapping, roughly on-beat (see section boundaries above)
DELAYS=(3500 19000 36000 50000 60500 69500 82000 96500 108000 121000 127500 140000 148500 161500 173500 189500)
IN=""; FC=""
for i in $(seq 0 15); do
  IN="$IN -i $N/line-${FILES[$i]}.mp3"
  d=${DELAYS[$i]}
  FC="$FC[$i:a]adelay=$d|$d[a$i];"
done
MIX="$(for i in $(seq 0 15); do echo -n "[a$i]"; done)amix=inputs=16:normalize=0[aout]"
"$FFMPEG" -y -v error $IN -filter_complex "$FC$MIX" -map "[aout]" -c:a libmp3lame -q:a 4 "$OUT/narration.mp3"
"$FFPROBE" -v error -show_entries format=duration -of csv=p=0 "$OUT/narration.mp3" | xargs echo "narration duration:"

"$FFMPEG" -y -v error -i "$OUT/video-only.mp4" -i "$OUT/narration.mp3" -c:v copy -c:a aac -b:a 160k demo-v4.mp4
"$FFPROBE" -v error -show_entries format=duration,size -of csv=p=0 demo-v4.mp4 | xargs echo "final:"
echo "done -> demo-v4.mp4"
