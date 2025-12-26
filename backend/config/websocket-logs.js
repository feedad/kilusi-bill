/**
 * WebSocket Log Streaming Service
 * Streams log file changes in real-time to connected dashboard clients
 */

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { logger } = require('./logger');

let wss = null;
let logWatcher = null;

/**
 * Initialize WebSocket server for log streaming
 * @param {http.Server} server - HTTP server to attach WebSocket to
 */
    // Create WebSocket server in noServer mode
    wss = new WebSocket.Server({
        noServer: true,
        path: '/ws/logs'
    });

    logger.info('WebSocket log streaming server initialized on /ws/logs');

    wss.on('connection', (ws, req) => {
        logger.info(`Dashboard client connected to log stream from ${req.socket.remoteAddress}`);

        // Send initial connection message
        ws.send(JSON.stringify({
            type: 'connected',
            message: 'Connected to log stream',
            timestamp: new Date().toISOString()
        }));

        // Start watching log file if not already watching
        if (!logWatcher) {
            startLogWatcher();
        }

        ws.on('close', () => {
            logger.info('Dashboard client disconnected from log stream');

            // Stop watcher if no clients connected
            if (wss.clients.size === 0 && logWatcher) {
                stopLogWatcher();
            }
        });

        ws.on('error', (error) => {
            logger.error('WebSocket error:', error.message);
        });
    });

    return wss;
}

/**
 * Start watching the log file for changes
 */
function startLogWatcher() {
    const logPath = path.join(__dirname, '../logs/combined.log');

    if (!fs.existsSync(logPath)) {
        logger.warn('Log file not found, creating empty file:', logPath);
        fs.writeFileSync(logPath, '');
    }

    let lastPosition = fs.statSync(logPath).size;
    let lastMtime = fs.statSync(logPath).mtimeMs;

    logger.info('Started watching log file for changes');

    // Poll for changes every 500ms (more reliable than fs.watch)
    logWatcher = setInterval(() => {
        try {
            const stats = fs.statSync(logPath);

            // Check if file was modified
            if (stats.mtimeMs > lastMtime && stats.size > lastPosition) {
                const newContent = readNewLogContent(logPath, lastPosition, stats.size);
                lastPosition = stats.size;
                lastMtime = stats.mtimeMs;

                if (newContent.length > 0) {
                    broadcastLogs(newContent);
                }
            } else if (stats.size < lastPosition) {
                // Log file was truncated/rotated
                lastPosition = 0;
                lastMtime = stats.mtimeMs;
            }
        } catch (error) {
            // File might be temporarily unavailable
        }
    }, 500);
}

/**
 * Read new content from log file
 */
function readNewLogContent(logPath, startPos, endPos) {
    const buffer = Buffer.alloc(endPos - startPos);
    const fd = fs.openSync(logPath, 'r');
    fs.readSync(fd, buffer, 0, buffer.length, startPos);
    fs.closeSync(fd);

    const content = buffer.toString('utf8');
    const lines = content.split('\n').filter(line => line.trim());

    return lines.map(line => parseLogLine(line)).filter(log => log);
}

/**
 * Parse a log line into structured format
 */
function parseLogLine(line) {
    // Parse format: "2025-12-09 15:32:30 info: message"
    const match = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) (\w+): (.+)$/);

    if (match) {
        return {
            timestamp: new Date(match[1].replace(' ', 'T')).toISOString(),
            level: match[2].toLowerCase(),
            message: match[3]
        };
    }

    return null;
}

/**
 * Broadcast new log entries to all connected clients
 */
function broadcastLogs(logs) {
    if (!wss || wss.clients.size === 0) return;

    const message = JSON.stringify({
        type: 'logs',
        logs: logs,
        timestamp: new Date().toISOString()
    });

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

/**
 * Stop watching the log file
 */
function stopLogWatcher() {
    if (logWatcher) {
        clearInterval(logWatcher);
        logWatcher = null;
        logger.info('Stopped watching log file');
    }
}

/**
 * Close WebSocket server
 */
function closeLogWebSocket() {
    stopLogWatcher();
    if (wss) {
        wss.close();
        wss = null;
        logger.info('WebSocket log streaming server closed');
    }
}

/**
 * Handle HTTP upgrade request
 */
function handleUpgrade(request, socket, head) {
    if (wss) {
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    } else {
        socket.destroy();
    }
}

module.exports = {
    initializeLogWebSocket,
    closeLogWebSocket,
    handleUpgrade
};
