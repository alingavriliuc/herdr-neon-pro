# Add to your Claude Code status line script (after: input=$(cat)).
# Shares the Claude quotas with Herdr's Neon Pro status bar.
rate_5h=$(echo "$input" | jq -r '.rate_limits.five_hour.used_percentage // empty')
rate_7d=$(echo "$input" | jq -r '.rate_limits.seven_day.used_percentage // empty')
if [ -n "$rate_5h$rate_7d" ]; then
  mkdir -p "$HOME/.cache/herdr" 2>/dev/null
  echo "$input" | jq -c '{rate_limits: .rate_limits, updated: (now | floor)}' \
    > "$HOME/.cache/herdr/claude-quota.json.tmp" 2>/dev/null \
    && mv "$HOME/.cache/herdr/claude-quota.json.tmp" "$HOME/.cache/herdr/claude-quota.json"
fi
