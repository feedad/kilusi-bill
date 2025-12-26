import { useState, useEffect } from 'react';

function Docs() {
    const [spec, setSpec] = useState(null);
    const [loading, setLoading] = useState(true);
    const [expandedPaths, setExpandedPaths] = useState({});
    const [selectedTag, setSelectedTag] = useState('all');

    useEffect(() => {
        fetchOpenAPISpec();
    }, []);

    const fetchOpenAPISpec = async () => {
        try {
            const response = await fetch('/api/v1/api-management/openapi');
            const result = await response.json();
            // Handle wrapped response format: {success, data: {...}}
            const data = result.data || result;
            setSpec(data);
        } catch (error) {
            console.error('Failed to fetch OpenAPI spec:', error);
        }
        setLoading(false);
    };

    const togglePath = (path) => {
        setExpandedPaths(prev => ({
            ...prev,
            [path]: !prev[path]
        }));
    };

    const methodColors = {
        get: '#10b981',
        post: '#3b82f6',
        put: '#f59e0b',
        patch: '#8b5cf6',
        delete: '#ef4444'
    };

    const getUniqueTags = () => {
        if (!spec?.paths) return [];
        const tags = new Set();
        Object.values(spec.paths).forEach(methods => {
            Object.values(methods).forEach(endpoint => {
                if (endpoint.tags) {
                    endpoint.tags.forEach(tag => tags.add(tag));
                }
            });
        });
        return Array.from(tags);
    };

    const getFilteredPaths = () => {
        if (!spec?.paths) return {};
        if (selectedTag === 'all') return spec.paths;

        const filtered = {};
        Object.entries(spec.paths).forEach(([path, methods]) => {
            const filteredMethods = {};
            Object.entries(methods).forEach(([method, endpoint]) => {
                if (endpoint.tags?.includes(selectedTag)) {
                    filteredMethods[method] = endpoint;
                }
            });
            if (Object.keys(filteredMethods).length > 0) {
                filtered[path] = filteredMethods;
            }
        });
        return filtered;
    };

    if (loading) {
        return <div style={{ color: 'var(--text-secondary)' }}>Loading API documentation...</div>;
    }

    if (!spec) {
        return <div style={{ color: 'var(--text-muted)' }}>Failed to load API documentation</div>;
    }

    const filteredPaths = getFilteredPaths();

    return (
        <div className="docs-container">
            {/* Header */}
            <div className="card" style={{ marginBottom: '24px' }}>
                <div className="card-header">
                    <h3 className="card-title">📚 {spec.info?.title || 'API Documentation'}</h3>
                    <span style={{
                        background: 'var(--primary)',
                        padding: '4px 12px',
                        borderRadius: '4px',
                        fontSize: '12px'
                    }}>
                        v{spec.info?.version || '1.0.0'}
                    </span>
                </div>
                <div className="card-body">
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
                        {spec.info?.description}
                    </p>

                    {/* Tag Filter */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        <button
                            className={`btn btn-sm ${selectedTag === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setSelectedTag('all')}
                        >
                            All
                        </button>
                        {getUniqueTags().map(tag => (
                            <button
                                key={tag}
                                className={`btn btn-sm ${selectedTag === tag ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => setSelectedTag(tag)}
                            >
                                {tag}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Authentication Info */}
            <div className="card" style={{ marginBottom: '24px' }}>
                <div className="card-header">
                    <h3 className="card-title">🔐 Authentication</h3>
                </div>
                <div className="card-body">
                    <p style={{ color: 'var(--text-secondary)' }}>
                        Most endpoints require JWT Bearer token authentication. Include the token in the Authorization header:
                    </p>
                    <pre style={{
                        background: 'var(--bg-secondary)',
                        padding: '12px',
                        borderRadius: '4px',
                        marginTop: '8px',
                        overflow: 'auto'
                    }}>
                        Authorization: Bearer {"<your-jwt-token>"}
                    </pre>
                </div>
            </div>

            {/* Endpoints */}
            <div className="card">
                <div className="card-header">
                    <h3 className="card-title">🔗 Endpoints ({Object.keys(filteredPaths).length})</h3>
                </div>
                <div className="card-body" style={{ padding: 0 }}>
                    {Object.entries(filteredPaths).map(([path, methods]) => (
                        <div key={path} style={{ borderBottom: '1px solid var(--border-color)' }}>
                            {Object.entries(methods).map(([method, endpoint]) => (
                                <div key={`${path}-${method}`}>
                                    <div
                                        onClick={() => togglePath(`${path}-${method}`)}
                                        style={{
                                            padding: '16px',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px',
                                            background: expandedPaths[`${path}-${method}`] ? 'var(--bg-secondary)' : 'transparent'
                                        }}
                                    >
                                        <span style={{
                                            background: methodColors[method] || '#6b7280',
                                            color: 'white',
                                            padding: '4px 8px',
                                            borderRadius: '4px',
                                            fontSize: '12px',
                                            fontWeight: 'bold',
                                            minWidth: '60px',
                                            textAlign: 'center'
                                        }}>
                                            {method.toUpperCase()}
                                        </span>
                                        <span style={{
                                            fontFamily: 'monospace',
                                            color: 'var(--text-primary)'
                                        }}>
                                            {path}
                                        </span>
                                        <span style={{
                                            color: 'var(--text-muted)',
                                            fontSize: '13px',
                                            flex: 1
                                        }}>
                                            {endpoint.summary}
                                        </span>
                                        {endpoint.security && (
                                            <span style={{ color: 'var(--warning)', fontSize: '12px' }}>
                                                🔒
                                            </span>
                                        )}
                                        <span style={{ color: 'var(--text-muted)' }}>
                                            {expandedPaths[`${path}-${method}`] ? '▼' : '▶'}
                                        </span>
                                    </div>

                                    {expandedPaths[`${path}-${method}`] && (
                                        <div style={{
                                            padding: '16px 16px 16px 100px',
                                            background: 'var(--bg-tertiary)',
                                            borderTop: '1px solid var(--border-color)'
                                        }}>
                                            <p style={{ marginBottom: '12px', color: 'var(--text-secondary)' }}>
                                                {endpoint.description}
                                            </p>

                                            {/* Tags */}
                                            {endpoint.tags && (
                                                <div style={{ marginBottom: '12px' }}>
                                                    <strong>Tags: </strong>
                                                    {endpoint.tags.map(tag => (
                                                        <span key={tag} style={{
                                                            background: 'var(--bg-secondary)',
                                                            padding: '2px 8px',
                                                            borderRadius: '4px',
                                                            marginLeft: '4px',
                                                            fontSize: '12px'
                                                        }}>
                                                            {tag}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Parameters */}
                                            {endpoint.parameters && endpoint.parameters.length > 0 && (
                                                <div style={{ marginBottom: '12px' }}>
                                                    <strong>Parameters:</strong>
                                                    <table style={{
                                                        width: '100%',
                                                        marginTop: '8px',
                                                        fontSize: '13px'
                                                    }}>
                                                        <thead>
                                                            <tr style={{ background: 'var(--bg-secondary)' }}>
                                                                <th style={{ padding: '8px', textAlign: 'left' }}>Name</th>
                                                                <th style={{ padding: '8px', textAlign: 'left' }}>In</th>
                                                                <th style={{ padding: '8px', textAlign: 'left' }}>Type</th>
                                                                <th style={{ padding: '8px', textAlign: 'left' }}>Required</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {endpoint.parameters.map((param, idx) => (
                                                                <tr key={idx}>
                                                                    <td style={{ padding: '8px', fontFamily: 'monospace' }}>{param.name}</td>
                                                                    <td style={{ padding: '8px' }}>{param.in}</td>
                                                                    <td style={{ padding: '8px' }}>{param.schema?.type}</td>
                                                                    <td style={{ padding: '8px' }}>{param.required ? '✓' : '-'}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}

                                            {/* Request Body */}
                                            {endpoint.requestBody && (
                                                <div style={{ marginBottom: '12px' }}>
                                                    <strong>Request Body:</strong>
                                                    <pre style={{
                                                        background: 'var(--bg-secondary)',
                                                        padding: '12px',
                                                        borderRadius: '4px',
                                                        marginTop: '8px',
                                                        overflow: 'auto',
                                                        fontSize: '12px'
                                                    }}>
                                                        {JSON.stringify(
                                                            endpoint.requestBody?.content?.['application/json']?.schema,
                                                            null,
                                                            2
                                                        )}
                                                    </pre>
                                                </div>
                                            )}

                                            {/* Responses */}
                                            {endpoint.responses && (
                                                <div>
                                                    <strong>Responses:</strong>
                                                    <div style={{ marginTop: '8px' }}>
                                                        {Object.entries(endpoint.responses).map(([code, resp]) => (
                                                            <div key={code} style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '8px',
                                                                marginBottom: '4px'
                                                            }}>
                                                                <span style={{
                                                                    background: code.startsWith('2') ? 'var(--success)' : 'var(--error)',
                                                                    color: 'white',
                                                                    padding: '2px 8px',
                                                                    borderRadius: '4px',
                                                                    fontSize: '12px'
                                                                }}>
                                                                    {code}
                                                                </span>
                                                                <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                                                                    {resp.description}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default Docs;
