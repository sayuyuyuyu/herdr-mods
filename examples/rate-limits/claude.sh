#!/bin/sh
# Claude Code's own rate limits as the rate-limit JSON the Herdr status bar reads.
#
# Whatever writes them (a status line, a poller) has to leave `five_hour_used` / `seven_day_used`
# as percents used and `five_hour_resets_at` / `seven_day_resets_at` as epoch seconds.
# CLAUDE_RATE_FILE overrides the path.
set -u
file=${CLAUDE_RATE_FILE:-$HOME/.cache/claude-statusline/rate.json}
[ -r "$file" ] || exit 1

jq -c '
  { title: "claude",
    limits: [ {label: "5h", used: .five_hour_used, resets_at: .five_hour_resets_at},
              {label: "7d", used: .seven_day_used, resets_at: .seven_day_resets_at} ]
            | map(select(.used != null)) }' "$file"
