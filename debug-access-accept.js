#!/usr/bin/env node

/**
 * Debug script to show exactly what's in the Access-Accept packet
 */

const dgram = require('dgram');
const radius = require('radius');

// Create a fake RADIUS client to intercept Access-Accept
const client = dgram.createSocket('udp4');
const secret = 'testing123'; // Use the same secret as in nas_servers

client.on('message', (msg, rinfo) => {
  console.log('\n=== Received RADIUS Response ===');
  console.log(`From: ${rinfo.address}:${rinfo.port}`);
  console.log(`Length: ${msg.length} bytes`);
  console.log(`Raw (hex): ${msg.toString('hex').substring(0, 100)}...`);
  
  try {
    const decoded = radius.decode({ packet: msg, secret: secret });
    console.log('\nDecoded packet:');
    console.log(`  Code: ${decoded.code} (${decoded.code === 'Access-Accept' ? '✅ Accept' : decoded.code === 'Access-Reject' ? '❌ Reject' : decoded.code})`);
    console.log(`  Identifier: ${decoded.identifier}`);
    console.log('\nAttributes:');
    Object.keys(decoded.attributes).forEach(key => {
      const value = decoded.attributes[key];
      if (Buffer.isBuffer(value)) {
        console.log(`  ${key}: <Buffer ${value.length} bytes> ${value.toString('hex').substring(0, 40)}...`);
      } else {
        console.log(`  ${key}: ${value}`);
      }
    });
    
    // Check critical attributes
    console.log('\n=== Critical Attributes Check ===');
    const checks = [
      { name: 'Service-Type', expected: 'Framed-User', actual: decoded.attributes['Service-Type'] },
      { name: 'Framed-Protocol', expected: 'PPP', actual: decoded.attributes['Framed-Protocol'] },
      { name: 'Mikrotik-Group', expected: 'UpTo-10M', actual: decoded.attributes['Mikrotik-Group'] }
    ];
    
    checks.forEach(check => {
      const status = check.actual === check.expected ? '✅' : '❌';
      console.log(`${status} ${check.name}: ${check.actual || 'MISSING'} ${check.expected ? `(expected: ${check.expected})` : ''}`);
    });
    
    // Check for Vendor-Specific
    if (decoded.attributes['Vendor-Specific']) {
      console.log('\n=== Vendor-Specific Attributes ===');
      const vsa = decoded.attributes['Vendor-Specific'];
      if (Buffer.isBuffer(vsa)) {
        console.log(`VSA Buffer (hex): ${vsa.toString('hex')}`);
        if (vsa.length >= 6) {
          const vendorId = vsa.readUInt32BE(0);
          const attrType = vsa.readUInt8(4);
          const attrLen = vsa.readUInt8(5);
          console.log(`  Vendor ID: ${vendorId} ${vendorId === 14988 ? '(MikroTik)' : ''}`);
          console.log(`  Attribute Type: ${attrType}`);
          console.log(`  Attribute Length: ${attrLen}`);
          if (attrLen > 2 && vsa.length >= 6 + attrLen - 2) {
            const attrValue = vsa.slice(6, 6 + attrLen - 2).toString('utf8');
            console.log(`  Attribute Value: ${attrValue}`);
          }
        }
      } else if (Array.isArray(vsa)) {
        vsa.forEach((v, i) => {
          console.log(`VSA[${i}]:`, v);
        });
      }
    }
    
  } catch (err) {
    console.error('Error decoding:', err.message);
  }
  
  client.close();
  process.exit(0);
});

client.on('error', (err) => {
  console.error('Socket error:', err);
  process.exit(1);
});

// Send Access-Request
const packet = radius.encode({
  code: 'Access-Request',
  secret: secret,
  identifier: Math.floor(Math.random() * 256),
  attributes: [
    ['User-Name', 'apptest'],
    ['User-Password', '1234567'],
    ['NAS-IP-Address', '172.22.10.156'],
    ['Service-Type', 'Framed-User'],
    ['Framed-Protocol', 'PPP']
  ]
});

console.log('Sending Access-Request for user "apptest"...');
client.send(packet, 0, packet.length, 1812, '127.0.0.1', (err) => {
  if (err) {
    console.error('Send error:', err);
    process.exit(1);
  }
  console.log('Access-Request sent, waiting for response...\n');
});

// Timeout after 5 seconds
setTimeout(() => {
  console.error('\n❌ Timeout: No response received after 5 seconds');
  client.close();
  process.exit(1);
}, 5000);
