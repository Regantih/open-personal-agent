#!/usr/bin/env bash
# Assemble demo-v2.mp4: title card + browser-handoff clip + tour clip + end card.
# Captions are timed overlays on the live recordings (no narration yet).
set -e
cd "$(dirname "$0")"
FFMPEG="/c/Users/hrega/AppData/Local/Microsoft/WinGet/Links/ffmpeg"
FONT="shots/arialbd.ttf"
REC5="rec5/page@a2a24408a1f895d6c65dead6a994b6e8.webm"
REC6="rec6/page@6014449035c7d6c9456ecaf83fa615cf.webm"
OUT=build2
mkdir -p "$OUT"

cap() { # drawtext chain: enable='between(t,a,b)', bottom bar
  echo "drawbox=x=0:y=h-74:w=iw:h=74:color=black@0.72:t=fill:enable='between(t,$1,$2)',drawtext=fontfile=$FONT:text='$3':fontsize=26:fontcolor=white:x=20:y=h-50:enable='between(t,$1,$2)'"
}

# --- title + end cards (3s each, 1440x900) ---
"$FFMPEG" -y -v error -f lavfi -i "color=0x0f1117:s=1440x900:d=3:r=30" -vf \
  "drawtext=fontfile=$FONT:text='Open Personal Agent':fontsize=72:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2-80,drawtext=fontfile=$FONT:text='it drives a real browser - you watch, approve, or take over':fontsize=30:fontcolor=0x9aa4b2:x=(w-text_w)/2:y=(h-text_h)/2+10,drawtext=fontfile=$FONT:text='github.com/Regantih/open-personal-agent':fontsize=24:fontcolor=0x6b7280:x=(w-text_w)/2:y=h-100" \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p "$OUT/00-title.mp4"

"$FFMPEG" -y -v error -f lavfi -i "color=0x0f1117:s=1440x900:d=3:r=30" -vf \
  "drawtext=fontfile=$FONT:text='Open source. Your data, your keys, your rules.':fontsize=40:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2-40,drawtext=fontfile=$FONT:text='github.com/Regantih/open-personal-agent':fontsize=28:fontcolor=0x9aa4b2:x=(w-text_w)/2:y=(h-text_h)/2+40" \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p "$OUT/99-end.mp4"

# --- browser handoff (rec5, 37s) ---
"$FFMPEG" -y -v error -i "$REC5" -vf \
  "fps=30,scale=1440:900,$(cap 0 9 'Ask it to open a page - the agent drives a real Chromium session'),$(cap 9.5 17 'Browser actions are T3\: nothing navigates without a signed approval'),$(cap 17.5 22.5 'Approved - Chromium opens github.com live on the server'),$(cap 23 33 'The Browser tab streams the agents view - click into it to take over'),$(cap 33.5 36.5 'Close anytime - the kill switch revokes sessions instantly')" \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -an "$OUT/01-browser.mp4"

# --- tour (rec6, 20s) ---
"$FFMPEG" -y -v error -i "$REC6" -vf \
  "fps=30,scale=1440:900,$(cap 0 4.5 'Talk to it - browser speech in, spoken replies out via ElevenLabs'),$(cap 6 10 'Memory you own\: provenance on every fact, OMF export, delete anytime'),$(cap 10.5 20 'Connect real accounts - Google Calendar and Gmail replace the sample data')" \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -an "$OUT/02-tour.mp4"

# --- concat ---
cat > "$OUT/list.txt" <<'EOF'
file '00-title.mp4'
file '01-browser.mp4'
file '02-tour.mp4'
file '99-end.mp4'
EOF
"$FFMPEG" -y -v error -f concat -safe 0 -i "$OUT/list.txt" -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p demo-v2.mp4
echo "done -> demo-v2.mp4"
