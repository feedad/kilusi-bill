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

echo "Uploading Virtual Parameters..."
VPARAM_FILE="./genieacs/virtual_parameters.json"
if [ -f "$VPARAM_FILE" ]; then
    # We need to install jq effectively or use a simple python/node script to parse json if jq is missing.
    # Assuming jq might be missing, let's use a tiny node script since we have node.
    
    node -e "
      const fs = require('fs');
      const http = require('http');
      const vparams = JSON.parse(fs.readFileSync('$VPARAM_FILE', 'utf8'));
      
      vparams.forEach(vp => {
        const id = vp._id;
        const script = vp.script;
        console.log('Uploading VParam: ' + id);
        
        const req = http.request({
          hostname: 'localhost',
          port: 7557,
          path: '/virtual_parameters/' + id,
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' }
        }, res => {
          res.on('data', () => {}); 
        });
        
        req.on('error', (e) => console.error('Error uploading ' + id + ': ' + e.message));
        req.write(JSON.stringify({script: script}));
        req.end();
      });
    "
else
    echo "virtual_parameters.json not found."
fi

echo "Start presets setup..."

# Preset: Default Boot (Runs on '1 BOOT')
curl -s -X PUT "$NBI_URL/presets/default-boot" \
    -H "Content-Type: application/json" \
    -d '{
      "weight": 0,
      "events": { "1 BOOT": true, "0 BOOTSTRAP": true },
      "configurations": [
        {
          "type": "provision",
          "name": "default"
        }
      ]
    }'

# Preset: Periodic Inform (Runs on '2 PERIODIC')
curl -s -X PUT "$NBI_URL/presets/default-periodic" \
    -H "Content-Type: application/json" \
    -d '{
      "weight": 0,
      "events": { "2 PERIODIC": true },
      "configurations": [
        {
          "type": "provision",
          "name": "default"
        }
      ]
    }'

echo "All provisions, parameters, and presets uploaded."
