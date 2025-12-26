import { useState, useEffect } from 'react';

const MAX_HISTORY = 20;
const MAX_TEMPLATES = 10;
const STORAGE_KEY_HISTORY = 'api_dashboard_history';
const STORAGE_KEY_TEMPLATES = 'api_dashboard_templates';

function Testing() {
    const [method, setMethod] = useState('GET');
    const [url, setUrl] = useState('/api/v1/health');
    const [headers, setHeaders] = useState('{}');
    const [body, setBody] = useState('');
    const [response, setResponse] = useState(null);
    const [loading, setLoading] = useState(false);
    const [history, setHistory] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [templateName, setTemplateName] = useState('');
    const [showHistory, setShowHistory] = useState(false);
    const [showTemplates, setShowTemplates] = useState(false);

    // Load history and templates from localStorage on mount
    useEffect(() => {
        try {
            const savedHistory = localStorage.getItem(STORAGE_KEY_HISTORY);
            if (savedHistory) setHistory(JSON.parse(savedHistory));

            const savedTemplates = localStorage.getItem(STORAGE_KEY_TEMPLATES);
            if (savedTemplates) setTemplates(JSON.parse(savedTemplates));
        } catch (error) {
            console.error('Failed to load from localStorage:', error);
        }
    }, []);

    const commonEndpoints = [
        { method: 'GET', url: '/api/v1/health', label: 'Health Check' },
        { method: 'GET', url: '/api/v1/api-management/stats', label: 'API Stats' },
        { method: 'GET', url: '/api/v1/api-management/logs', label: 'Get Logs' },
        { method: 'GET', url: '/api/v1/api-management/endpoints', label: 'List Endpoints' },
        { method: 'GET', url: '/api/v1/api-management/services', label: 'Service Status' },
        { method: 'GET', url: '/api/v1/customers', label: 'List Customers' },
        { method: 'GET', url: '/api/v1/packages', label: 'List Packages' },
    ];

    const sendRequest = async () => {
        setLoading(true);
        setResponse(null);

        try {
            let parsedHeaders = {};
            try {
                parsedHeaders = JSON.parse(headers);
            } catch {
                parsedHeaders = {};
            }

            let parsedBody = null;
            if (body.trim()) {
                try {
                    parsedBody = JSON.parse(body);
                } catch {
                    parsedBody = body;
                }
            }

            const res = await fetch('/api/v1/api-management/test-endpoint', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    method,
                    url,
                    headers: parsedHeaders,
                    body: parsedBody
                })
            });

            const data = await res.json();
            setResponse(data);

            // Add to history
            addToHistory({
                method,
                url,
                headers,
                body,
                status: data.response?.status || 'Error',
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            setResponse({
                success: false,
                error: error.message
            });
        }

        setLoading(false);
    };

    const addToHistory = (item) => {
        const newHistory = [item, ...history.slice(0, MAX_HISTORY - 1)];
        setHistory(newHistory);
        localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(newHistory));
    };

    const clearHistory = () => {
        setHistory([]);
        localStorage.removeItem(STORAGE_KEY_HISTORY);
    };

    const loadFromHistory = (item) => {
        setMethod(item.method);
        setUrl(item.url);
        setHeaders(item.headers);
        setBody(item.body || '');
        setShowHistory(false);
    };

    const saveTemplate = () => {
        if (!templateName.trim()) {
            alert('Please enter a template name');
            return;
        }

        const template = {
            name: templateName,
            method,
            url,
            headers,
            body,
            createdAt: new Date().toISOString()
        };

        const newTemplates = [template, ...templates.slice(0, MAX_TEMPLATES - 1)];
        setTemplates(newTemplates);
        localStorage.setItem(STORAGE_KEY_TEMPLATES, JSON.stringify(newTemplates));
        setTemplateName('');
        alert('Template saved!');
    };

    const loadTemplate = (template) => {
        setMethod(template.method);
        setUrl(template.url);
        setHeaders(template.headers);
        setBody(template.body || '');
        setShowTemplates(false);
    };

    const deleteTemplate = (index) => {
        const newTemplates = templates.filter((_, i) => i !== index);
        setTemplates(newTemplates);
        localStorage.setItem(STORAGE_KEY_TEMPLATES, JSON.stringify(newTemplates));
    };

    const selectEndpoint = (endpoint) => {
        setMethod(endpoint.method);
        setUrl(endpoint.url);
    };

    const formatJson = (obj) => {
        try {
            return JSON.stringify(obj, null, 2);
        } catch {
            return String(obj);
        }
    };

    const formatTime = (timestamp) => {
        return new Date(timestamp).toLocaleTimeString();
    };

    return (
        <>
            {/* Quick Select & Actions */}
            <div className="card" style={{ marginBottom: '24px' }}>
                <div className="card-header">
                    <h3 className="card-title">⚡ Quick Select</h3>
                    <div className="controls">
                        <button
                            className={`btn btn-sm ${showHistory ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => { setShowHistory(!showHistory); setShowTemplates(false); }}
                        >
                            📜 History ({history.length})
                        </button>
                        <button
                            className={`btn btn-sm ${showTemplates ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => { setShowTemplates(!showTemplates); setShowHistory(false); }}
                        >
                            💾 Templates ({templates.length})
                        </button>
                    </div>
                </div>
                <div className="card-body">
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {commonEndpoints.map((ep, idx) => (
                            <button
                                key={idx}
                                className="btn btn-sm btn-secondary"
                                onClick={() => selectEndpoint(ep)}
                            >
                                <span className={`method-badge ${ep.method.toLowerCase()}`} style={{ marginRight: '8px' }}>
                                    {ep.method}
                                </span>
                                {ep.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* History Panel */}
            {showHistory && (
                <div className="card" style={{ marginBottom: '24px' }}>
                    <div className="card-header">
                        <h3 className="card-title">📜 Request History</h3>
                        <button className="btn btn-sm btn-secondary" onClick={clearHistory}>
                            🗑️ Clear All
                        </button>
                    </div>
                    <div className="card-body" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                        {history.length === 0 ? (
                            <div style={{ color: 'var(--text-muted)', textAlign: 'center' }}>
                                No history yet
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {history.map((item, idx) => (
                                    <div
                                        key={idx}
                                        onClick={() => loadFromHistory(item)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            padding: '8px',
                                            background: 'var(--bg-secondary)',
                                            borderRadius: '4px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <span className={`method-badge ${item.method.toLowerCase()}`}>
                                            {item.method}
                                        </span>
                                        <span style={{ flex: 1, fontSize: '13px' }}>{item.url}</span>
                                        <span style={{
                                            fontSize: '12px',
                                            color: item.status >= 200 && item.status < 400 ? 'var(--success)' : 'var(--error)'
                                        }}>
                                            {item.status}
                                        </span>
                                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                            {formatTime(item.timestamp)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Templates Panel */}
            {showTemplates && (
                <div className="card" style={{ marginBottom: '24px' }}>
                    <div className="card-header">
                        <h3 className="card-title">💾 Saved Templates</h3>
                    </div>
                    <div className="card-body">
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                            <input
                                type="text"
                                className="form-control"
                                placeholder="Template name..."
                                value={templateName}
                                onChange={(e) => setTemplateName(e.target.value)}
                                style={{ flex: 1 }}
                            />
                            <button className="btn btn-primary" onClick={saveTemplate}>
                                💾 Save Current
                            </button>
                        </div>
                        {templates.length === 0 ? (
                            <div style={{ color: 'var(--text-muted)', textAlign: 'center' }}>
                                No saved templates
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {templates.map((template, idx) => (
                                    <div
                                        key={idx}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            padding: '8px',
                                            background: 'var(--bg-secondary)',
                                            borderRadius: '4px'
                                        }}
                                    >
                                        <span className={`method-badge ${template.method.toLowerCase()}`}>
                                            {template.method}
                                        </span>
                                        <span style={{ fontWeight: 'bold', marginRight: '8px' }}>{template.name}</span>
                                        <span style={{ flex: 1, fontSize: '13px', color: 'var(--text-muted)' }}>{template.url}</span>
                                        <button
                                            className="btn btn-sm btn-secondary"
                                            onClick={() => loadTemplate(template)}
                                        >
                                            📂 Load
                                        </button>
                                        <button
                                            className="btn btn-sm btn-secondary"
                                            onClick={() => deleteTemplate(idx)}
                                            style={{ color: 'var(--error)' }}
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div className="playground-grid">
                {/* Request Panel */}
                <div className="request-panel">
                    <div className="panel-header">📤 Request</div>
                    <div className="panel-body">
                        <div className="form-group">
                            <label>Method</label>
                            <select className="form-control" value={method} onChange={(e) => setMethod(e.target.value)}>
                                <option value="GET">GET</option>
                                <option value="POST">POST</option>
                                <option value="PUT">PUT</option>
                                <option value="PATCH">PATCH</option>
                                <option value="DELETE">DELETE</option>
                            </select>
                        </div>

                        <div className="form-group">
                            <label>URL</label>
                            <input
                                type="text"
                                className="form-control"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                placeholder="/api/v1/..."
                            />
                        </div>

                        <div className="form-group">
                            <label>Headers (JSON)</label>
                            <textarea
                                className="form-control"
                                value={headers}
                                onChange={(e) => setHeaders(e.target.value)}
                                placeholder='{"Authorization": "Bearer token"}'
                                style={{ minHeight: '80px' }}
                            />
                        </div>

                        {['POST', 'PUT', 'PATCH'].includes(method) && (
                            <div className="form-group">
                                <label>Body (JSON)</label>
                                <textarea
                                    className="form-control"
                                    value={body}
                                    onChange={(e) => setBody(e.target.value)}
                                    placeholder='{"key": "value"}'
                                />
                            </div>
                        )}

                        <button
                            className="btn btn-primary"
                            onClick={sendRequest}
                            disabled={loading}
                            style={{ width: '100%' }}
                        >
                            {loading ? '⏳ Sending...' : '🚀 Send Request'}
                        </button>
                    </div>
                </div>

                {/* Response Panel */}
                <div className="response-panel">
                    <div className="panel-header">
                        📥 Response
                        {response?.response?.responseTime && (
                            <span style={{
                                fontSize: '12px',
                                background: 'var(--bg-secondary)',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                marginLeft: '8px'
                            }}>
                                {response.response.responseTime}ms
                            </span>
                        )}
                    </div>
                    <div className="panel-body">
                        {response ? (
                            <>
                                <div style={{ marginBottom: '16px' }}>
                                    <span style={{
                                        padding: '4px 12px',
                                        borderRadius: '4px',
                                        background: response.success ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                        color: response.success ? 'var(--accent-success)' : 'var(--accent-error)'
                                    }}>
                                        {response.response?.status || 'Error'} {response.response?.statusText || ''}
                                    </span>
                                </div>
                                <div className="response-code">
                                    {formatJson(response.response?.data || response.error || response)}
                                </div>
                            </>
                        ) : (
                            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '32px' }}>
                                Send a request to see the response
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}

export default Testing;
