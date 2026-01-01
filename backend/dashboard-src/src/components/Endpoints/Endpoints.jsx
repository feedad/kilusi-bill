import { useState, useEffect } from 'react';

function Endpoints() {
    const [endpoints, setEndpoints] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedEndpoint, setSelectedEndpoint] = useState(null);
    const [endpointDetail, setEndpointDetail] = useState(null);

    useEffect(() => {
        fetchEndpoints();
    }, []);

    const fetchEndpoints = async () => {
        try {
            const response = await fetch('/api/v1/api-management/endpoints');
            const result = await response.json();
            const data = result.data || result;
            setEndpoints(data.endpoints || []);
        } catch (error) {
            console.error('Failed to fetch endpoints:', error);
        }
        setLoading(false);
    };

    const fetchEndpointDetail = async (name) => {
        setSelectedEndpoint(name);
        try {
            const response = await fetch(`/api/v1/api-management/endpoints/${name}`);
            const result = await response.json();
            const data = result.data || result;
            setEndpointDetail(data);
        } catch (error) {
            console.error('Failed to fetch endpoint detail:', error);
            setEndpointDetail(null);
        }
    };

    if (loading) {
        return <div style={{ color: 'var(--text-secondary)' }}>Loading endpoints...</div>;
    }

    return (
        <div className="grid-2">
            {/* Endpoints List */}
            <div className="card">
                <div className="card-header">
                    <h3 className="card-title">📚 API Endpoints ({endpoints.length})</h3>
                </div>
                <div className="card-body">
                    <div className="endpoint-list">
                        {endpoints.map((endpoint, index) => (
                            <div
                                key={index}
                                className="endpoint-item"
                                onClick={() => fetchEndpointDetail(endpoint.name)}
                                style={{
                                    borderLeft: selectedEndpoint === endpoint.name
                                        ? '3px solid var(--accent-primary)'
                                        : '3px solid transparent'
                                }}
                            >
                                <div className="method-badge post">API</div>
                                <div>
                                    <div className="endpoint-path">{endpoint.path}</div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                        {endpoint.description}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Endpoint Detail */}
            <div className="card">
                <div className="card-header">
                    <h3 className="card-title">📄 Endpoint Detail</h3>
                </div>
                <div className="card-body">
                    {endpointDetail ? (
                        <div>
                            <h4 style={{ marginBottom: '16px', color: 'var(--accent-primary)' }}>
                                /api/v1/{endpointDetail.name}
                            </h4>

                            <div style={{ marginBottom: '16px' }}>
                                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                                    Routes ({endpointDetail.totalRoutes})
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {endpointDetail.routes?.map((route, idx) => (
                                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span className={`method-badge ${route.method.toLowerCase()}`}>
                                                {route.method}
                                            </span>
                                            <code style={{ fontSize: '13px' }}>{route.path}</code>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                                <div>File: {endpointDetail.file}</div>
                                <div>Size: {Math.round(endpointDetail.fileSize / 1024)} KB</div>
                            </div>
                        </div>
                    ) : (
                        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '32px' }}>
                            Select an endpoint to view details
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default Endpoints;
