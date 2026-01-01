'use client'

import React from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface TrafficDataPoint {
  time: string
  download: number
  upload: number
}

interface TrafficGraphProps {
  data: TrafficDataPoint[]
  interfaceName?: string
  isActive?: boolean
  hasReceivedData?: boolean
}

export default function TrafficGraph({ data, interfaceName = 'N/A', isActive = false, hasReceivedData = false }: TrafficGraphProps) {
  const formatTrafficSpeed = (value: number) => {
    if (value === 0) return '0 bps'

    const k = 1000
    const sizes = ['bps', 'Kbps', 'Mbps', 'Gbps']
    const i = Math.floor(Math.log(value) / Math.log(k))

    return parseFloat((value / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-gray-800 p-3 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg">
          <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">
            {label}
          </p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {formatTrafficSpeed(entry.value)}
            </p>
          ))}
        </div>
      )
    }
    return null
  }

  // Always show the chart container, even with no data

  return (
    <div className="w-full">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
          Real-time Traffic Graph
        </h3>
      </div>

      <ResponsiveContainer width="100%" height={250}>
        {data.length === 0 && !hasReceivedData ? (
          <div className="w-full h-full flex items-center justify-center bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
            <div className="text-center">
              <div className="text-gray-400 mb-2">
                <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Menunggu data traffic...
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Interface: {interfaceName}
              </p>
            </div>
          </div>
        ) : (
          <LineChart
            data={data.length > 0 ? data : [{ time: '', download: 0, upload: 0 }]}
            margin={{
              top: 5,
              right: 30,
              left: 20,
              bottom: 5,
            }}
          >
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 12 }}
              stroke="#6B7280"
            />
            <YAxis
              tick={{ fontSize: 12 }}
              stroke="#6B7280"
              tickFormatter={formatTrafficSpeed}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: '12px' }}
              iconType="line"
            />
            <Line
              type="monotone"
              dataKey="download"
              stroke="#3B82F6"
              strokeWidth={2}
              name="Download"
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="upload"
              stroke="#10B981"
              strokeWidth={2}
              name="Upload"
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        )}
      </ResponsiveContainer>

      <div className="mt-4 flex items-center justify-center gap-6 text-xs text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
          <span>Download</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
          <span>Upload</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div>
          <span>Real-time</span>
        </div>
      </div>
    </div>
  )
}