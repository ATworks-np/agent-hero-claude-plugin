#!/bin/bash
# agent-hero のシミュレーションをコンパイルして実行する。引数はそのまま simulate.js へ渡す
#   例: tools/simulate.sh --tokens 13000000 --hours 8 --days 60
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT=$(mktemp -d)
# tsc は型の不足 (node の型定義が無いこと) を報告しても JS は出力するので、終了コードは見ない
(cd "$ROOT" && tsc --target es2023 --module esnext --moduleResolution bundler --skipLibCheck --outDir "$OUT" --rootDir . tools/simulate.ts) >/dev/null 2>&1 || true
cd "$OUT" && echo '{"type":"module"}' > package.json
for f in hooks/*.js tools/*.js; do sed -i '' -E "s#from '(\.\.?/[^']+)'#from '\1.js'#" "$f"; done
node tools/simulate.js "$@"
