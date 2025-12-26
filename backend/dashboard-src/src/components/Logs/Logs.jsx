import { useState, useEffect, useRef, useCallback } from 'react';

function Logs() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [level, setLevel] = useState('all');
    const [wsConnected, setWsConnected] = useState(false);
    const [useWebSocket, setUseWebSocket] = useState(true);
    const logsContainerRef = useRef(null);
    const wsRef = useRef(null);

    // Fetch initial logs via HTTP
    const fetchLogs = useCallback(async () => {
        try {
            const params = new URLSearchParams({ limit: 100 });
            if (level !== 'all') params.set('level', level);

            const response = await fetch(`/api/v1/api-management/logs?${params}`);
            const result = await response.json();
            const data = result.data || result;
            setLogs(data.logs || []);
        } catch (error) {
            console.error('Failed to fetch logs:', error);
        }
        setLoading(false);
    }, [level]);

    // Connect to WebSocket for real-time logs
    useEffect(() => {
        if (!useWebSocket) return;

        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${window.location.host}/ws/logs`;

        try {
            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onopen = () => {
                console.log('WebSocket connected to log stream');
                setWsConnected(true);
            };

            ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);

                    if (message.type === 'logs' && message.logs) {
                        setLogs(prevLogs => {
                            // Filter by level if needed
                            let newLogs = message.logs;
                            if (level !== 'all') {
                                newLogs = newLogs.filter(log => log.level === level);
                            }

                            // Add new logs to the beginning, keep max 200
                            const combined = [...newLogs, ...prevLogs];
                            return combined.slice(0, 200);
                        });
                    }
                } catch (err) {
                    console.error('Failed to parse WebSocket message:', err);
                }
            };

            ws.onclose = () => {
                console.log('WebSocket disconnected');
                setWsConnected(false);
            };

            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                setWsConnected(false);
            };

            return () => {
                ws.close();
            };
        } catch (error) {
            console.error('Failed to connect WebSocket:', error);
            setUseWebSocket(false);
        }
    }, [useWebSocket, level]);

    // Fetch initial logs on mount and when level changes
    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    const formatTime = (timestamp) => {
        try {
            return new Date(timestamp).toLocaleTimeString();
        } catch {
            return '-';
        }
    };

    const clearLogs = () => {
        setLogs([]);
    };

    if (loading) {
        return <div style={{ color: 'var(--text-secondary)' }}>Loading logs...</div>;
    }

    return (
        <div className="card">
            <div className="card-header">
                <h3 className="card-title">
                    📟 Console Logs
                    <span
                        style={{
                            marginLeft: '8px',
                            fontSize: '12px',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            backgroundColor: wsConnected ? 'var(--success)' : 'var(--warning)',
                            color: 'white'
                        }}
                    >
                        {wsConnected ? '🔴 Live' : '⏸️ Polling'}
                    </span>
                </h3>
                <div className="controls">
                    <select
                        className="filter-select"
                        value={level}
                        onChange={(e) => setLevel(e.target.value)}
                    >
                        <option value="all">All Levels</option>
                        <option value="error">Error</option>
                        <option value="warn">Warning</option>
                        <option value="info">Info</option>
                        <option value="debug">Debug</option>
                    </select>
                    <button
                        className={`btn btn-sm ${useWebSocket ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setUseWebSocket(!useWebSocket)}
                        title={useWebSocket ? 'Switch to polling' : 'Enable WebSocket'}
                    >
                        {useWebSocket ? '📡 WS' : '🔄 Poll'}
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={fetchLogs}>
                        🔄 Refresh
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={clearLogs}>
                        🗑️ Clear
                    </button>
                </div>
            </div>

            <div className="log-container" ref={logsContainerRef}>
                {logs.length === 0 ? (
                    <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        No logs available
                    </div>
                ) : (
                    logs.map((log, index) => (
                        <div className="log-entry" key={index}>
                            <span className="log-time">{formatTime(log.timestamp)}</span>
                            <span className={`log-level ${log.level}`}>{log.level}</span>
                            <span className="log-message">{log.message}</span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

export default Logs;
