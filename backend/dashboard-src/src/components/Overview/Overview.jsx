import { useState, useEffect } from 'react';

function Overview() {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchStats();
        const interval = setInterval(fetchStats, 5000);
        return () => clearInterval(interval);
    }, []);

    const fetchStats = async () => {
        try {
            const response = await fetch('/api/v1/api-management/stats');
            const result = await response.json();
            // Handle wrapped response format: {success, data: {...}}
            const data = result.data || result;
            setStats(data);
        } catch (error) {
            console.error('Failed to fetch stats:', error);
        }
        setLoading(false);
    };

    if (loading) {
        return <div style={{ color: 'var(--text-secondary)' }}>Loading statistics...</div>;
    }

    const statCards = [
        {
            label: 'Total Requests',
            value: stats?.api?.totalRequests || 0,
            icon: '🔄',
            color: 'purple'
        },
        {
            label: 'Errors',
            value: stats?.api?.totalErrors || 0,
            icon: '⚠️',
            color: 'red'
        },
        {
            label: 'Avg Response',
            value: `${stats?.api?.avgResponseTime || 0}ms`,
            icon: '⚡',
            color: 'green'
        },
        {
            label: 'Uptime',
            value: stats?.system?.uptimeFormatted || '-',
            icon: '⏱️',
            color: 'blue'
        },
    ];

    const services = stats?.services || {};

    return (
        <>
            {/* Stats Grid */}
            <div className="stats-grid">
                {statCards.map((stat, index) => (
                    <div className="stat-card" key={index}>
                        <div className={`stat-icon ${stat.color}`}>{stat.icon}</div>
                        <div className="stat-info">
                            <h3>{stat.label}</h3>
                            <div className="stat-value">{stat.value}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Main Content */}
            <div className="grid-2">
                {/* System Info */}
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title">📈 System Information</h3>
                    </div>
                    <div className="card-body">
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                            <div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Node.js Version</div>
                                <div style={{ fontWeight: '500', marginTop: '4px' }}>{stats?.system?.nodeVersion || '-'}</div>
                            </div>
                            <div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Platform</div>
                                <div style={{ fontWeight: '500', marginTop: '4px' }}>{stats?.system?.platform || '-'}</div>
                            </div>
                            <div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Memory Used</div>
                                <div style={{ fontWeight: '500', marginTop: '4px' }}>{stats?.system?.memory?.used || 0} MB</div>
                            </div>
                            <div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Error Rate</div>
                                <div style={{ fontWeight: '500', marginTop: '4px' }}>{stats?.api?.errorRate || 0}%</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Service Status */}
                <div className="grid-col">
                    <div className="card">
                        <div className="card-header">
                            <h3 className="card-title">❤️ Service Status</h3>
                        </div>
                        <div className="card-body">
                            <ul className="service-list">
                                {Object.entries(services).map(([name, info]) => {
                                    // Handle both string and object formats
                                    const status = typeof info === 'object' ? info?.status : info;
                                    const message = typeof info === 'object' ? info?.message : '';
                                    const isOnline = status === 'connected' || status === 'active';
                                    const isWarning = status === 'warning';
                                    const isError = status === 'error' || status === 'disconnected';

                                    // Get status color
                                    const getStatusColor = () => {
                                        if (isOnline) return 'var(--success)';
                                        if (isWarning) return 'var(--warning, #f59e0b)';
                                        return 'var(--error)';
                                    };

                                    // Get dot class
                                    const getDotClass = () => {
                                        if (isOnline) return 'online';
                                        if (isWarning) return 'warning';
                                        return 'offline';
                                    };

                                    // Format service name nicely
                                    const displayName = name
                                        .replace(/([A-Z])/g, ' $1')
                                        .replace(/^./, str => str.toUpperCase())
                                        .replace('Db', 'DB')
                                        .replace('radius', 'RADIUS')
                                        .replace('freeradius', 'FreeRADIUS');

                                    return (
                                        <li className="service-item" key={name}>
                                            <div>
                                                <span className="service-name">{displayName}</span>
                                                {message && (
                                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                                                        ({message})
                                                    </span>
                                                )}
                                            </div>
                                            <div className="service-status">
                                                <div className={`service-dot ${getDotClass()}`}></div>
                                                <span style={{ fontSize: '13px', color: getStatusColor() }}>
                                                    {status || 'unknown'}
                                                </span>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="card">
                        <div className="card-header">
                            <h3 className="card-title">🛠️ Quick Actions</h3>
                        </div>
                        <div className="card-body">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <a href="/api/v1/health" target="_blank" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
                                    ❤️ Health Check
                                </a>
                                <a href="/api/v1/api-management/endpoints" target="_blank" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
                                    📚 View Endpoints JSON
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

export default Overview;
