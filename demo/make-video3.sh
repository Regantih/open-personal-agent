#!/usr/bin/env bash
# Assemble demo-v3.mp4: narrated getting-started + build-your-own demo.
#   title(4s) -> rec7 use-it(41s) -> rec5 browser(37s) -> rec6 tour(20s)
#   -> rec8 code tour(58s) -> end(4s)  ~= 164s
set -e
cd "$(dirname "$0")"
FFMPEG="/c/Users/hrega/AppData/Local/Microsoft/WinGet/Links/ffmpeg"
FFPROBE="/c/Users/hrega/AppData/Local/Microsoft/WinGet/Links/ffprobe"
FONT="shots/arialbd.ttf"
REC5="rec5/page@a2a24408a1f895d6c65dead6a994b6e8.webm"
REC6="rec6/page@6014449035c7d6c9456ecaf83fa615cf.webm"
REC7="rec7/page@92ec8c7ff6f3ac6f4468de43a1bda934.webm"
REC8="rec8/page@9076d54cadb7182116812ce5080fda6d.webm"
OUT=build3
mkdir -p "$OUT"

cap() {
  echo "drawbox=x=0:y=h-74:w=iw:h=74:color=black@0.72:t=fill:enable='between(t,$1,$2)',drawtext=fontfile=$FONT:text='$3':fontsize=26:fontcolor=white:x=20:y=h-50:enable='between(t,$1,$2)'"
}

# title + end cards
"$FFMPEG" -y -v error -f lavfi -i "color=0x0f1117:s=1440x900:d=4:r=30" -vf \
  "drawtext=fontfile=$FONT:text='Open Personal Agent':fontsize=72:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2-80,drawtext=fontfile=$FONT:text='a personal agent you text - it asks before it spends money or acts as you':fontsize=28:fontcolor=0x9aa4b2:x=(w-text_w)/2:y=(h-text_h)/2+10,drawtext=fontfile=$FONT:text='github.com/Regantih/open-personal-agent':fontsize=24:fontcolor=0x6b7280:x=(w-text_w)/2:y=h-100" \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p "$OUT/00-title.mp4"
"$FFMPEG" -y -v error -f lavfi -i "color=0x0f1117:s=1440x900:d=8:r=30" -vf \
  "drawtext=fontfile=$FONT:text='Open source. Your data, your keys, your rules.':fontsize=40:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2-40,drawtext=fontfile=$FONT:text='github.com/Regantih/open-personal-agent':fontsize=28:fontcolor=0x9aa4b2:x=(w-text_w)/2:y=(h-text_h)/2+40" \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p "$OUT/99-end.mp4"

# rec7: remember + flight + T3 approval (41s)
"$FFMPEG" -y -v error -i "$REC7" -vf \
  "fps=30,scale=1440:900,$(cap 0 8 'clone the repo - npm install, npm run dev - it works on built-in sample data'),$(cap 9 16 'teach it a fact - it lands in memory you own'),$(cap 18 27 'ask for a flight - the provider layer returns real offers'),$(cap 28 36 'booking is T3 - the agent stops and asks first'),$(cap 36 41 'approved - single-use card capped at the fare, added to calendar')" \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -an "$OUT/01-useit.mp4"

# rec5: browser handoff (37s)
"$FFMPEG" -y -v error -i "$REC5" -vf \
  "fps=30,scale=1440:900,$(cap 0 9 'hand it a browser - T3 approval first'),$(cap 10 22 'a real Chromium session navigates on the server'),$(cap 23 32 'the Browser tab streams live - click in to take over'),$(cap 32 37 'close anytime - the kill switch revokes instantly')" \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -an "$OUT/02-browser.mp4"

# rec6: tour (20s)
"$FFMPEG" -y -v error -i "$REC6" -vf \
  "fps=30,scale=1440:900,$(cap 0 4.5 'talk to it - speech in, spoken replies out'),$(cap 6 10 'memory you own - provenance, OMF export, delete'),$(cap 10.5 20 'connect Google Calendar + Gmail - samples become real data')" \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -an "$OUT/03-tour.mp4"

# rec8: code tour (58s)
"$FFMPEG" -y -v error -i "$REC8" -vf \
  "fps=30,scale=1440:900,$(cap 0 12 'the repo - README, deploy docs, everything open'),$(cap 12 24 'spec/risk-policy - every action tiered T0-T3, unmatched fails closed'),$(cap 24 37 'tools.ts - add a capability\: name, schema, prepare, execute'),$(cap 37 58 'providers/ - connect real accounts; Google is the reference')" \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -an "$OUT/04-code.mp4"

cat > "$OUT/list.txt" <<'EOF'
file '00-title.mp4'
file '01-useit.mp4'
file '02-browser.mp4'
file '03-tour.mp4'
file '04-code.mp4'
file '99-end.mp4'
EOF
"$FFMPEG" -y -v error -f concat -safe 0 -i "$OUT/list.txt" -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p "$OUT/video-only.mp4"

# ---- narration track: each line adelayed to its beat ----
N=narration-v3
DELAYS=(4000 20000 33000 43000 53000 62000 72000 80500 86000 97000 112000 128000 145000 158000)
IN=""; FC=""
for i in $(seq 0 13); do
  n=$(printf "%02d" $((i+1)))
  IN="$IN -i $N/line-$n.mp3"
  d=${DELAYS[$i]}
  FC="$FC[$i:a]adelay=$d|$d[a$i];"
done
MIX="$(for i in $(seq 0 13); do echo -n "[a$i]"; done)amix=inputs=14:normalize=0[aout]"
"$FFMPEG" -y -v error $IN -filter_complex "$FC$MIX" -map "[aout]" -c:a libmp3lame -q:a 4 "$OUT/narration.mp3"
"$FFPROBE" -v error -show_entries format=duration -of csv=p=0 "$OUT/narration.mp3" | xargs echo "narration duration:"

"$FFMPEG" -y -v error -i "$OUT/video-only.mp4" -i "$OUT/narration.mp3" -c:v copy -c:a aac -b:a 160k -shortest demo-v3.mp4
"$FFPROBE" -v error -show_entries format=duration,size -of csv=p=0 demo-v3.mp4 | xargs echo "final:"
echo "done -> demo-v3.mp4"
