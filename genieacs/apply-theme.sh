#!/bin/bash
# Helper script to inject Kilusi Theme into GenieACS container

CONTAINER_NAME="genieacs-ui"
THEME_FILE="/opt/genieacs/public/kilusi-theme.css"
TARGET_CSS_DIR="/opt/genieacs/public"

echo "Injecting Kilusi Theme into GenieACS..."

# Find the active app CSS file (it has a hash in the name)
# We execute this Inside the container command context later, or use docker exec now.

docker exec -u root $CONTAINER_NAME sh -c "
  # Find the main app css file
  APP_CSS=\$(find /opt/genieacs/public -name 'app*.css' | head -n 1)
  
  if [ -f \"\$APP_CSS\" ]; then
    echo \"Found app CSS: \$APP_CSS\"
    
    # Check if already injected
    if grep -q 'Kilusi Bill Theme' \"\$APP_CSS\"; then
      echo 'Theme already injected.'
    else
      echo 'Appending Kilusi Theme...'
      cat $THEME_FILE >> \"\$APP_CSS\"
      echo 'Injection complete.'
    fi
  else
    echo 'Error: Could not find app*.css'
  fi
"
