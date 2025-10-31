import React from 'react'

/**
 * Reusable dark-themed Table component
 * Props:
 *   columns: Array<{ key, label, render? }>
 *   data: Array<Object>
 *   loading: boolean
 *   error: string
 *   emptyMessage: string
 */
export default function Table({ columns = [], data = [], loading = false, error = '', emptyMessage = 'Tidak ada data' }) {
  if (loading) {
    return (
      <div className="table-container">
        <div style={{ textAlign: 'center', padding: 32, color: '#8b949e' }}>
          <div className="spinner" />
          <div>Loading...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="table-container">
        <div style={{ textAlign: 'center', padding: 32, color: '#ff7b72' }}>
          Error: {error}
        </div>
      </div>
    )
  }

  return (
    <div className="table-container">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th key={i}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={{ textAlign: 'center', color: '#6e7681' }}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, i) => (
              <tr key={i}>
                {columns.map((col, j) => (
                  <td key={j}>
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
