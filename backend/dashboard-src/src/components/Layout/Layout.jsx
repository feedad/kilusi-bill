import React, { useState, useEffect } from 'react';

function Layout({ children, currentTab, setCurrentTab, user, onLogout }) {
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
    const navItems = [
        { id: 'overview', label: 'Overview', icon: '📊' },
        { id: 'logs', label: 'Logs', icon: '📟' },
        { id: 'endpoints', label: 'Endpoints', icon: '🔌' },
        { id: 'testing', label: 'Testing', icon: '🧪' },
        { id: 'docs', label: 'Docs', icon: '📚' },
    ];

    const tabTitles = {
        overview: 'Dashboard Overview',
        logs: 'Console Logs',
        endpoints: 'API Endpoints',
        testing: 'API Testing Playground',
        docs: 'API Documentation'
    };

    // Close mobile sidebar when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (isMobileSidebarOpen && !event.target.closest('.sidebar') && !event.target.closest('.mobile-menu-btn')) {
                setIsMobileSidebarOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isMobileSidebarOpen]);

    const toggleMobileSidebar = () => {
        setIsMobileSidebarOpen(!isMobileSidebarOpen);
    };

    return (
        <div className="app-container">
            {/* Mobile Overlay */}
            {isMobileSidebarOpen && (
                <div className="mobile-overlay" onClick={() => setIsMobileSidebarOpen(false)}></div>
            )}

            <aside className={`sidebar ${isMobileSidebarOpen ? 'mobile-open' : ''}`}>
                <div className="sidebar-header">
                    <div className="sidebar-logo">
                        <span>🖥️</span>
                        <h1>Kilusi API</h1>
                    </div>
                    {/* Close button for mobile */}
                    <button
                        className="mobile-close-btn"
                        onClick={() => setIsMobileSidebarOpen(false)}
                        aria-label="Close sidebar"
                    >
                        ✕
                    </button>
                </div>

                <nav className="sidebar-nav">
                    {navItems.map(item => (
                        <button
                            key={item.id}
                            className={`nav-item ${currentTab === item.id ? 'active' : ''}`}
                            onClick={() => {
                                setCurrentTab(item.id);
                                setIsMobileSidebarOpen(false); // Close sidebar on mobile after navigation
                            }}
                        >
                            <span>{item.icon}</span>
                            {item.label}
                        </button>
                    ))}
                </nav>

                <div style={{ padding: '16px', borderTop: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                        Logged in as
                    </div>
                    <div style={{ fontWeight: '500', marginBottom: '12px' }}>
                        {user?.username} ({user?.role})
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={onLogout} style={{ width: '100%' }}>
                        🚪 Logout
                    </button>
                </div>
            </aside>

            <main className="main-content">
                <header className="header">
                    <div className="header-left">
                        {/* Hamburger Menu Button */}
                        <button
                            className="mobile-menu-btn"
                            onClick={toggleMobileSidebar}
                            aria-label="Toggle menu"
                        >
                            ☰
                        </button>
                        <h2 className="header-title">{tabTitles[currentTab]}</h2>
                    </div>
                    <div className="header-actions">
                        <div className="status-badge">
                            <div className="status-dot"></div>
                            Backend Active
                        </div>
                    </div>
                </header>

                <div className="content">
                    {children}
                </div>
            </main>
        </div>
    );
}

export default Layout;
