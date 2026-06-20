#!/bin/bash

# Script to mark voucher as used when RADIUS session ends
# Called by FreeRADIUS Exec-Module when user disconnects
# Receives RADIUS attributes as env vars (hyphens → underscores)
# e.g., User-Name → USER_NAME, Acct-Session-Time → ACCT_SESSION_TIME

USERNAME="${USER_NAME}"
ACCT_INPUT="${ACCT_INPUT_OCTETS:-0}"
ACCT_OUTPUT="${ACCT_OUTPUT_OCTETS:-0}"
ACCT_SESSION_TIME="${ACCT_SESSION_TIME:-0}"
ACCT_TERMINATE_CAUSE="${ACCT_TERMINATE_CAUSE:-}"

logger -t voucher-mark-used "Session ended for user: $USERNAME, duration: ${ACCT_SESSION_TIME}s, cause: $ACCT_TERMINATE_CAUSE"

# Call backend API to mark voucher as used
BACKEND_URL="http://localhost:3001/api/v1/hotspot/voucher/session-end"
RESPONSE=$(curl -s -X POST "$BACKEND_URL" \
  -H "Content-Type: application/json" \
  -d "{
    \"username\": \"${USERNAME}\",
    \"acct_input_octets\": ${ACCT_INPUT},
    \"acct_output_octets\": ${ACCT_OUTPUT},
    \"acct_session_time\": ${ACCT_SESSION_TIME},
    \"terminate_cause\": \"${ACCT_TERMINATE_CAUSE}\"
  }" \
  --connect-timeout 5 --max-time 10)

logger -t voucher-mark-used "Backend response: $RESPONSE"

exit 0
