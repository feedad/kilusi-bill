import React from 'react'

export default function Sparkline({ data=[], width=280, height=64, stroke='var(--accent-blue)', fill='rgba(88,166,255,0.12)' }){
  if(!data.length) return <div className="muted" style={{height}}>-</div>
  const max = Math.max(...data)
  const min = Math.min(...data)
  const pad = 4
  const w = width - pad*2
  const h = height - pad*2
  const points = data.map((v, i) => {
    const x = pad + (i/(data.length-1))*w
    const y = pad + (max===min ? h/2 : h - ((v-min)/(max-min))*h)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  const area = `${pad},${height-pad} ` + points + ` ${width-pad},${height-pad}`

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline points={area} fill={fill} stroke="none" />
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
