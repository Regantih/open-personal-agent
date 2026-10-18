#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/shots"
FONT="arialbd.ttf"

declare -A CAP=(
  [01]="Text it like a person - web chat, SMS, or email"
  [02]="User: Check my inbox and handle anything important"
  [03]="It reads the inbox - and flags the phishing email instead of obeying it"
  [04]="Untrusted email taints the turn: a routine draft now needs approval"
  [05]="Pending approvals: 4-digit code, 10-minute expiry, bound to amount and merchant"
  [06]="Approved - a signed mandate is issued and verified before anything executes"
  [07]="Book a refundable flight to SFO - it searches, picks one, and asks first"
  [08]="Nothing books without you: \$409 refundable, bound to the mandate"
  [09]="Approved - paid with a single-use card capped at \$409, added to calendar"
  [10]="Append-only log of every message, model call, policy decision and execution"
  [11]="Memory you own: provenance, scopes, OMF export and import, delete anytime"
  [12]="The sample data behind it: calendar, inbox, subscriptions, bookings, outbox"
  [13]="Risk policy: every action tiered T0-T3, unmatched actions fail closed"
  [14]="stop everything - pauses actions, cancels pending approvals, reads still work"
)

for n in 01 02 03 04 05 06 07 08 09 10 11 12 13 14; do
  txt="${CAP[$n]//:/\\:}"   # escape colons for drawtext
  ffmpeg -y -v error -i "seq-$n.png" -vf \
    "drawbox=x=0:y=826:w=1440:h=74:color=black@0.72:t=fill,drawtext=fontfile=$FONT:text='${txt}':fontsize=26:fontcolor=white:x=20:y=850" \
    "cap-$n.png"
done

# Title and end cards (1440x900)
ffmpeg -y -v error -f lavfi -i "color=0x0f1117:s=1440x900:d=1" -frames:v 1 -vf \
  "drawtext=fontfile=$FONT:text='Open Personal Agent':fontsize=72:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2-60,drawtext=fontfile=$FONT:text='a personal agent you text - it asks before it spends money or acts as you':fontsize=30:fontcolor=0x9aa4b2:x=(w-text_w)/2:y=(h-text_h)/2+30,drawtext=fontfile=$FONT:text='github.com/Regantih/open-personal-agent':fontsize=24:fontcolor=0x6b7280:x=(w-text_w)/2:y=h-120" \
  card-title.png
ffmpeg -y -v error -f lavfi -i "color=0x0f1117:s=1440x900:d=1" -frames:v 1 -vf \
  "drawtext=fontfile=$FONT:text='Open source. Your data, your keys, your rules.':fontsize=40:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2-40,drawtext=fontfile=$FONT:text='github.com/Regantih/open-personal-agent':fontsize=28:fontcolor=0x9aa4b2:x=(w-text_w)/2:y=(h-text_h)/2+40" \
  card-end.png

# concat list with durations
rm -f list.txt
echo "file 'card-title.png'" >> list.txt; echo "duration 3" >> list.txt
for n in 01 02 03 04 05 06 07 08 09 10 11 12 13 14; do
  echo "file 'cap-$n.png'" >> list.txt
  case $n in 03|04|07|08|09|14) echo "duration 6" >> list.txt;; *) echo "duration 4" >> list.txt;; esac
done
echo "file 'card-end.png'" >> list.txt

ffmpeg -y -v error -f concat -safe 0 -i list.txt -vf "fps=30,format=yuv420p" -c:v libx264 -preset medium -crf 20 ../demo.mp4
echo "done"
