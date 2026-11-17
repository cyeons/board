#!/bin/sh
# 사용: sh scripts/e2e.sh [playwright 인자]. 결과만 짧게 보여 준다.
npx playwright test --timeout=30000 "$@" 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -vE '^\[WebServer\] (\{|$)|inspector port|^\s*$' | cut -c1-240
