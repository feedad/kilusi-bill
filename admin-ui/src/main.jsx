import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth.js'
import Dashboard from './pages/Dashboard.jsx'
import Analytics from './pages/Analytics.jsx'
import NetworkMap from './pages/NetworkMap.jsx'
import SnmpDevices from './pages/SnmpDevices.jsx'
import SnmpMonitor from './pages/SnmpMonitor.jsx'
import Mikrotik from './pages/Mikrotik.jsx'
import Radius from './pages/Radius.jsx'
import Hotspot from './pages/Hotspot.jsx'
import Billing from './pages/Billing.jsx'
import Customers from './pages/Customers.jsx'
import Packages from './pages/Packages.jsx'
import Settings from './pages/Settings.jsx'
import Layout from './components/Layout.jsx'
import './styles.css'

function App() {
  const { loading, isAuthenticated, error } = useAuth()
  
  if (loading) {
    return (
      <div className="auth-overlay">
        <div className="spinner" />
        <div>Checking authentication...</div>
      </div>
    )
  }
  
  if (!isAuthenticated) {
    return (
      <div className="auth-overlay">
        <div style={{color:'var(--accent-red)'}}>⚠️ Not authenticated</div>
        <p style={{color:'var(--text-secondary)'}}>
          Please <a href="/admin/login" target="_blank">login</a> to the main admin panel first, then refresh this page.
        </p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    )
  }
  
  return (
    // Use a dedicated base path so dev URL is http://localhost:5173/ui/...
    <BrowserRouter basename="/ui">
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard/>} />
          <Route path="/analytics" element={<Analytics/>} />
          <Route path="/network-map" element={<NetworkMap/>} />
          <Route path="/snmp/devices" element={<SnmpDevices/>} />
          <Route path="/snmp/monitor" element={<SnmpMonitor/>} />
          <Route path="/mikrotik" element={<Mikrotik/>} />
          <Route path="/radius" element={<Radius/>} />
          <Route path="/hotspot" element={<Hotspot/>} />
          <Route path="/billing" element={<Billing/>} />
          <Route path="/customers" element={<Customers/>} />
          <Route path="/packages" element={<Packages/>} />
          <Route path="/settings" element={<Settings/>} />
          <Route path="*" element={<div className="muted">Select a page from the menu above.</div>} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}

createRoot(document.getElementById('root')).render(<App />)
