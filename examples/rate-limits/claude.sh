#!/bin/sh
# Claude Code's own rate limits as the rate-limit JSON the Herdr status bar reads.
#
# Whatever writes them (a status line, a poller) has to leave `five_hour_used` / `seven_day_used`
# as percents used and `five_hour_resets_at` / `seven_day_resets_at` as epoch seconds. The parse
# is sed so the machine needs no jq. CLAUDE_RATE_FILE overrides the path.
set -u
file=${CLAUDE_RATE_FILE:-$HOME/.cache/claude-statusline/rate.json}
[ -r "$file" ] || exit 1

value() {
  sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\([0-9][0-9.]*\).*/\1/p" "$file" | head -n 1
}

limit() { # label, used key, resets key
  used=$(value "$2")
  [ -n "$used" ] || return 0
  resets=$(value "$3")
  if [ -n "$resets" ]; then
    printf '{"label":"%s","used":%s,"resets_at":%s}' "$1" "$used" "$resets"
  else
    printf '{"label":"%s","used":%s}' "$1" "$used"
  fi
}

first=1
printf '{"title":"claude","limits":['
for pair in "5h five_hour_used five_hour_resets_at" "7d seven_day_used seven_day_resets_at"; do
  # shellcheck disable=SC2086
  set -- $pair
  item=$(limit "$1" "$2" "$3")
  [ -n "$item" ] || continue
  [ "$first" -eq 1 ] || printf ','
  first=0
  printf '%s' "$item"
done
printf ']}\n'
