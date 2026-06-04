#!/bin/bash

# Script to mark voucher as used when RADIUS session ends
# Called by FreeRADIUS Exec-Module when user disconnects

# Get RADIUS environment variables
USERNAME="\${User-Name}"
ACCT_SESSION_TIME="\${Acct-Session-Time}"
ACCT_TERMINATE_CAUSE="\${Acct-Terminate-Cause}"
ACCT_START_TIME="\${Acct-Start-Time}"
ACCT_STOP_TIME="\${Acct-Session-Time}"

# Log
logger -t voucher-mark-used "Session ended for user: $USERNAME, cause: $ACCT_TERMINATE_CAUSE, duration: $ACCT_SESSION_TIME seconds"

# Call backend API to mark voucher as used
BACKEND_URL="http://localhost:3001/api/v1/hotspot/voucher/session-end"
RESPONSE=\$(curl -s -X POST "$BACKEND_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "'"$USERNAME""',
    "session_duration": '$ACCT_SESSION_TIME',
    "terminate_cause": "'"$ACCT_TERMINATE_CAUSE""',
    "start_time": "'"$ACCT_START_TIME""',
    "stop_time": "'"$ACCT_STOP_TIME"'"
  }')

logger -t voucher-mark-used "Backend response: $RESPONSE"

exit 0
