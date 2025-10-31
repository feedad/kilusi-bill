import React from 'react'

export default function StatCard({ icon, label, value, sub }){
  return (
    <div className="card" style={{padding:'16px 16px'}}>
      <div className="label-sm" style={{display:'flex', alignItems:'center', gap:8}}>
        {icon ? <span aria-hidden>{icon}</span> : null}
        <span>{label}</span>
      </div>
      <div className="value-lg">{value}</div>
      {sub ? <div className="muted" style={{marginTop:4,fontSize:12}}>{sub}</div> : null}
    </div>
  )
}
