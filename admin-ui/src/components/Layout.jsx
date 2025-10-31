import React from 'react'
import { NavLink } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'

export default function Layout({ children }){
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main">
        <header className="app-header">
          <div className="container">
            <h1 className="app-title">Kilusi Admin</h1>
            <p className="subtitle">React admin (POC)</p>
            <nav className="app-nav">
              <NavLink to="/snmp/devices" className={({isActive}) => isActive ? 'active' : ''}>SNMP Devices</NavLink>
              <NavLink to="/snmp/monitor" className={({isActive}) => isActive ? 'active' : ''}>SNMP Monitor</NavLink>
            </nav>
          </div>
        </header>
        <main className="container content">
          {children}
        </main>
      </div>
    </div>
  )
}
