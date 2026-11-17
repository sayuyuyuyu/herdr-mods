#!/bin/sh
# OpenCode Go's quota as the rate-limit JSON the Herdr status bar reads.
#
# The key is Pi's: Pi asks the same endpoint for its own footer, so this reuses it rather
# than keeping a second copy. OPENCODE_GO_API_KEY wins when set.
set -u
key=${OPENCODE_GO_API_KEY:-$(jq -r '."opencode-go".key // empty' "$HOME/.pi/agent/auth.json" 2>/dev/null)}
[ -n "$key" ] || exit 1

usage=$(curl -sS --max-time 8 -H "Authorization: Bearer $key" https://opencode.ai/inference/go/v1/usage) || exit 1

printf '%s' "$usage" | jq -c '
  def epoch: if . == null then null else (sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601) end;
  { title: "go",
    limits: [ (.usage.rolling // {} | {label: "5h",  used: .percent, resets_at: (.resetsAt | epoch), status: .status}),
              (.usage.weekly  // {} | {label: "7d",  used: .percent, resets_at: (.resetsAt | epoch), status: .status}),
              (.usage.monthly // {} | {label: "30d", used: .percent, resets_at: (.resetsAt | epoch), status: .status}) ]
            | map(select(.used != null)) }'
