#!/bin/bash
# Helper script to inject Kilusi Theme into GenieACS container

CONTAINER_NAME="genieacs-ui"
THEME_FILE="/opt/genieacs/public/kilusi-theme-native.css"
LOGO_FILE="/opt/genieacs/public/logo.svg"
TARGET_CSS_DIR="/opt/genieacs/dist/public"

echo "Injecting Kilusi Theme into GenieACS..."

# Find the active app CSS file (it has a hash in the name)
# We execute this Inside the container command context later, or use docker exec now.

docker exec -u root $CONTAINER_NAME sh -c "
  # Find the main app css file
  APP_CSS=\$(find /opt/genieacs/dist/public -name 'app*.css' | head -n 1)
  
  if [ -f \"\$APP_CSS\" ]; then
    echo \"Found app CSS: \$APP_CSS\"
    
    # Check if we should backup original
    if [ ! -f \"\$APP_CSS.bak\" ]; then
      cp \"\$APP_CSS\" \"\$APP_CSS.bak\"
    fi
    
    # Overwrite by concatenating backup + theme
    # This ensures we always have a clean base + our theme, avoiding duplicates
    cat \"\$APP_CSS.bak\" > \"\$APP_CSS\"
    cat $THEME_FILE >> \"\$APP_CSS\"
    echo 'Theme applied successfully (Refreshed).'
  else
    echo 'Error: Could not find app*.css'
  fi
"

# Inject Logo (separate command to avoid quoting issues)
echo "Injecting Logo..."
docker exec -u root $CONTAINER_NAME sh -c "
  if [ -f $LOGO_FILE ]; then
    cp $LOGO_FILE /opt/genieacs/dist/public/logo.svg
    # Overwrite hashed logo files too
    for f in /opt/genieacs/dist/public/logo*.svg; do
      cp $LOGO_FILE \"\$f\"
    done
    echo 'Logo injected.'
  else
    echo 'Warning: Logo file not found at $LOGO_FILE'
  fi
"

echo "Done."
