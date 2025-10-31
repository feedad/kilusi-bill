import React from 'react'
import { NavLink } from 'react-router-dom'

export default function Sidebar(){
  return (
    <aside className="sidebar">
      <div className="logo">Kilusi</div>

      <div className="menu-section">
        <div className="menu-title">Overview</div>
        <nav className="menu">
          <NavLink to="/dashboard" className={({isActive}) => isActive ? 'active' : ''}>Dashboard</NavLink>
          <NavLink to="/analytics" className={({isActive}) => isActive ? 'active' : ''}>Analytics</NavLink>
          <NavLink to="/network-map" className={({isActive}) => isActive ? 'active' : ''}>Network Map</NavLink>
        </nav>
      </div>

      <div className="menu-section">
        <div className="menu-title">Devices</div>
        <nav className="menu">
          <NavLink to="/snmp/devices" className={({isActive}) => isActive ? 'active' : ''}>📊 SNMP Devices</NavLink>
          <NavLink to="/snmp/monitor" className={({isActive}) => isActive ? 'active' : ''}>🔍 SNMP Monitor</NavLink>
          <NavLink to="/mikrotik" className={({isActive}) => isActive ? 'active' : ''}>🔌 Mikrotik</NavLink>
          <NavLink to="/radius" className={({isActive}) => isActive ? 'active' : ''}>🔐 RADIUS</NavLink>
          <NavLink to="/hotspot" className={({isActive}) => isActive ? 'active' : ''}>📶 Hotspot</NavLink>
        </nav>
      </div>

      <div className="menu-section">
        <div className="menu-title">Billing</div>
        <nav className="menu">
          <NavLink to="/billing" className={({isActive}) => isActive ? 'active' : ''}>💰 Invoices</NavLink>
          <NavLink to="/customers" className={({isActive}) => isActive ? 'active' : ''}>👥 Customers</NavLink>
          <NavLink to="/packages" className={({isActive}) => isActive ? 'active' : ''}>📦 Packages</NavLink>
        </nav>
      </div>

      <div className="menu-section">
        <div className="menu-title">System</div>
        <nav className="menu">
          <NavLink to="/settings" className={({isActive}) => isActive ? 'active' : ''}>Settings</NavLink>
        </nav>
      </div>
    </aside>
  )
}
