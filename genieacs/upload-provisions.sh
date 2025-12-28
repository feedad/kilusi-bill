#!/bin/bash
# Upload Provisions to GenieACS NBI
# Usage: ./upload-provisions.sh

NBI_URL="http://localhost:7557"
PROVISIONS_DIR="./genieacs/provisions"

echo "Uploading provisions to GenieACS..."

if [ ! -d "$PROVISIONS_DIR" ]; then
    echo "Provisions directory $PROVISIONS_DIR not found!"
    exit 1
fi

for script in $PROVISIONS_DIR/*.js; do
    [ -e "$script" ] || continue
    
    filename=$(basename "$script" .js)
    echo "Uploading $filename..."
    
    # Read file content
    content=$(cat "$script")
    
    # Upload via API (PUT /provisions/ID)
    # Note: GenieACS NBI requires the script content in the body
    curl -s -X PUT "$NBI_URL/provisions/$filename" \
        --data-binary "@$script" \
        -H "Content-Type: text/plain"
        
    echo " - Done"
done

echo "Start presets setup..."
# Example: Create a preset that runs 'default' provision on '1 BOOT'
curl -s -X PUT "$NBI_URL/presets/default-boot" \
    -H "Content-Type: application/json" \
    -d '{
      "weight": 0,
      "precondition": "{\"_tags\":\"boot\"}",
      "configurations": [
        {
          "type": "provision",
          "name": "default"
        }
      ]
    }'

echo "All provisions uploaded."
