#!/usr/bin/env node
/**
 * Real-time RADIUS authentication monitor
 * Watch Access-Request/Accept/Reject and CHAP verification details
 */

const { logger } = require('./config/logger');
const radiusServer = require('./config/radius-server');

console.log('\n=== RADIUS Authentication Monitor ===');
console.log('Waiting for Access-Request packets...');
console.log('Press Ctrl+C to stop\n');

// Override console to show timestamps
const originalLog = console.log;
console.log = function(...args) {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  originalLog(`[${timestamp}]`, ...args);
};

// Monitor logs in real-time by watching logger output
const originalInfo = logger.info;
const originalWarn = logger.warn;
const originalError = logger.error;
const originalDebug = logger.debug;

logger.info = function(...args) {
  const msg = args.join(' ');
  if (msg.includes('Access-Request') || 
      msg.includes('Access-Accept') || 
      msg.includes('Authentication successful') ||
      msg.includes('Mikrotik-Group') ||
      msg.includes('Accounting')) {
    console.log('ℹ️ ', msg);
  }
  return originalInfo.apply(logger, args);
};

logger.warn = function(...args) {
  const msg = args.join(' ');
  if (msg.includes('CHAP') || 
      msg.includes('password') || 
      msg.includes('authentication')) {
    console.log('⚠️ ', msg);
  }
  return originalWarn.apply(logger, args);
};

logger.error = function(...args) {
  const msg = args.join(' ');
  if (msg.includes('REJECT') || 
      msg.includes('authentication') || 
      msg.includes('failed')) {
    console.log('❌', msg);
  }
  return originalError.apply(logger, args);
};

logger.debug = function(...args) {
  const msg = args.join(' ');
  if (msg.includes('CHAP verify')) {
    console.log('🔍', msg);
  }
  return originalDebug.apply(logger, args);
};

// Start RADIUS server
radiusServer.startRadiusServer().then(() => {
  console.log('✅ RADIUS server started, monitoring traffic...\n');
}).catch(err => {
  console.error('❌ Failed to start RADIUS server:', err.message);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nStopping monitor...');
  radiusServer.stopRadiusServer().then(() => {
    console.log('✅ Stopped');
    process.exit(0);
  });
});
