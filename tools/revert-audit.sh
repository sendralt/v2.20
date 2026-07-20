#!/bin/bash
#
# revert-audit.sh — Detect changes lost during a git revert/rollback
#
# USAGE:
#   ./tools/revert-audit.sh [revert-commit-hash]
#
# If no hash provided, auto-detects the most recent revert/rollback commit.
#
# OUTPUT:
#   Lists every file changed by the revert, classified by status:
#   ✅ RESTORED  — change has been re-applied since the revert
#   ❌ MISSING   — change was lost and NOT re-applied (ACTION NEEDED)
#   ⚠️  DIVERGED  — file changed but differs from both pre-revert and post-revert
#
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
if [ -z "$REPO_ROOT" ]; then
  echo "ERROR: Not inside a git repository"
  exit 1
fi
cd "$REPO_ROOT"

# Find the revert commit
if [ -n "${1:-}" ]; then
  REVERT_COMMIT="$1"
else
  REVERT_COMMIT="$(git log --oneline --all --grep='revert\|EMERGENCY\|rollback' | head -1 | awk '{print $1}')"
  if [ -z "$REVERT_COMMIT" ]; then
    echo "No revert/rollback commit found. Pass a commit hash: ./tools/revert-audit.sh <hash>"
    exit 0
  fi
fi

PARENT="$(git rev-parse "$REVERT_COMMIT^" 2>/dev/null)" || {
  echo "ERROR: $REVERT_COMMIT has no parent commit"
  exit 1
}

echo "=========================================="
echo "  REVERT AUDIT REPORT"
echo "=========================================="
echo "Revert commit: $REVERT_COMMIT"
echo "Message: $(git log -1 --format='%s' "$REVERT_COMMIT")"
echo "Parent (pre-revert): ${PARENT:0:12}"
echo "Files changed by revert: $(git diff --name-only "$REVERT_COMMIT^..$REVERT_COMMIT" | wc -l)"
echo "=========================================="
echo ""

MISSING_COUNT=0
RESTORED_COUNT=0
DIVERGED_COUNT=0

# For each file changed by the revert
while IFS= read -r file; do
  [ -z "$file" ] && continue

  # Skip deleted files that are still deleted
  if ! git cat-file -e "HEAD:$file" 2>/dev/null && ! git cat-file -e "$PARENT:$file" 2>/dev/null; then
    continue
  fi

  # Get content at three points
  PRE_REVERT="$(git show "$PARENT:$file" 2>/dev/null || echo '')"
  POST_REVERT="$(git show "$REVERT_COMMIT:$file" 2>/dev/null || echo '')"
  CURRENT="$(git show "HEAD:$file" 2>/dev/null || echo '')"

  # Classify
  if [ "$CURRENT" = "$PRE_REVERT" ]; then
    STATUS="✅ RESTORED"
    RESTORED_COUNT=$((RESTORED_COUNT + 1))
  elif [ "$CURRENT" = "$POST_REVERT" ]; then
    STATUS="❌ MISSING"
    MISSING_COUNT=$((MISSING_COUNT + 1))
  else
    STATUS="⚠️  DIVERGED"
    DIVERGED_COUNT=$((DIVERGED_COUNT + 1))
  fi

  # Only show non-restored files (unless --all flag)
  if [ "${2:-}" != "--all" ] && [ "$STATUS" = "✅ RESTORED" ]; then
    continue
  fi

  printf "%s  %s\n" "$STATUS" "$file"

done < <(git diff --name-only "$REVERT_COMMIT^..$REVERT_COMMIT")

echo ""
echo "=========================================="
echo "  SUMMARY"
echo "=========================================="
printf "✅ Restored (re-applied):  %d\n" "$RESTORED_COUNT"
printf "❌ Missing (lost!):        %d\n" "$MISSING_COUNT"
printf "⚠️  Diverged (changed):     %d\n" "$DIVERGED_COUNT"
echo "=========================================="

if [ "$MISSING_COUNT" -gt 0 ]; then
  echo ""
  echo "⚠️  ACTION REQUIRED: $MISSING_COUNT file(s) have changes that were lost"
  echo "   during the revert and have NOT been re-applied."
  echo "   Review each ❌ MISSING file above and re-apply as needed."
  exit 1
fi

echo ""
echo "✅ All changes accounted for."
