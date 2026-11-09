#!/bin/sh
# Builds Massive Armies into single-file pages:
#   index.html                 standalone page (GitHub Pages or any static host)
#   dist/massive-armies.html   body fragment for a claude.ai artifact (the host adds the document skeleton)
#   test/game-test.html        local test build with an eval hook for the headless harness
set -e
cd "$(dirname "$0")"
# embed the sound samples (sounds/*.mp3) as base64 so the game stays one file
python3 - <<'PY'
import json, base64, os
m=json.load(open('sounds/manifest.json')); g=json.load(open('sounds/gains.json'))
files={k:[base64.b64encode(open('sounds/'+f,'rb').read()).decode() for f,_ in v] for k,v in m.items()}
os.makedirs('dist',exist_ok=True)
names={k:[o for _,o in v] for k,v in m.items()}
open('dist/sfx-data.js','w').write('const SFX_DATA='+json.dumps({'gain':g,'names':names,'files':files},separators=(',',':'))+';\n')
PY
JS="src/data.js src/sim.js src/render.js dist/sfx-data.js src/audio.js src/game.js"
mkdir -p dist test
js_bundle(){ printf '\n<script>\n(()=>{\n"use strict";\n'; cat $JS; printf "$1"; printf '\n})();\n</script>\n'; }
{ cat src/shell.html; js_bundle ''; } > dist/massive-armies.html
# standalone: split the shell at the end of its <style> block into head and body
python3 - <<'PY'
s=open('src/shell.html').read(); i=s.index('</style>')+len('</style>')
head, body = s[:i], s[i:]
js=open('dist/massive-armies.html').read()[len(s):]
open('index.html','w').write('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
  + head + '\n</head>\n<body>' + body + js + '</body>\n</html>\n')
PY
{ printf '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'; cat src/shell.html; js_bundle '\nwindow.__ev=s=>eval(s);'; } > test/game-test.html
{ printf '(()=>{\n"use strict";\n'; cat $JS; printf '\n})();\n'; } > test/check.js
node --check test/check.js
echo "built index.html ($(wc -c < index.html) bytes) and dist/massive-armies.html ($(wc -c < dist/massive-armies.html) bytes)"
