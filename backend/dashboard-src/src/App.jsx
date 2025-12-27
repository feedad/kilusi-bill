import { useState, useEffect } from 'react';
import Layout from './components/Layout/Layout';
import Login from './components/Login';
import Overview from './components/Overview/Overview';
import Logs from './components/Logs/Logs';
import Endpoints from './components/Endpoints/Endpoints';
import Testing from './components/Testing/Testing';
import Docs from './components/Docs/Docs';

function App() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [user, setUser] = useState(null);
    const [currentTab, setCurrentTab] = useState('overview');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check if already authenticated
        const token = localStorage.getItem('dashboard_token');
        if (token) {
            verifyToken(token);
        } else {
            setLoading(false);
        }
    }, []);

    const verifyToken = async (token) => {
        try {
            const response = await fetch('/api/v1/api-management/dashboard-auth/verify', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                // Handle wrapped response format: {success: true, data: {valid: true, user: {...}}}
                const verifyData = data.data || data;
                if (verifyData.valid) {
                    setIsAuthenticated(true);
                    setUser(verifyData.user);
                } else {
                    localStorage.removeItem('dashboard_token');
                }
            } else {
                localStorage.removeItem('dashboard_token');
            }
        } catch (error) {
            console.error('Token verification failed:', error);
            localStorage.removeItem('dashboard_token');
        }
        setLoading(false);
    };

    const handleLogin = async (username, password) => {
        try {
            const response = await fetch('/api/v1/api-management/dashboard-auth', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (data.success) {
                localStorage.setItem('dashboard_token', data.token);
                setIsAuthenticated(true);
                setUser(data.user);
                return { success: true };
            } else {
                return { success: false, error: data.error || 'Login failed' };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    };

    const handleLogout = async () => {
        const token = localStorage.getItem('dashboard_token');
        try {
            await fetch('/api/v1/api-management/dashboard-auth/logout', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
        } catch (error) {
            console.error('Logout error:', error);
        }
        localStorage.removeItem('dashboard_token');
        setIsAuthenticated(false);
        setUser(null);
    };

    const renderContent = () => {
        switch (currentTab) {
            case 'overview':
                return <Overview />;
            case 'logs':
                return <Logs />;
            case 'endpoints':
                return <Endpoints />;
            case 'testing':
                return <Testing />;
            case 'docs':
                return <Docs />;
            default:
                return <Overview />;
        }
    };

    if (loading) {
        return (
            <div className="login-container">
                <div style={{ color: 'var(--text-secondary)' }}>Loading...</div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Login onLogin={handleLogin} />;
    }

    return (
        <Layout
            currentTab={currentTab}
            setCurrentTab={setCurrentTab}
            user={user}
            onLogout={handleLogout}
        >
            {renderContent()}
        </Layout>
    );
}

export default App;
