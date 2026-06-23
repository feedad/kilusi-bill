export default function GaugeCard({ label, value, color }: {
  label: string
  value: string
  color: 'blue' | 'red' | 'green'
}) {
  const colors = { blue: 'border-blue-200 bg-blue-50', red: 'border-red-200 bg-red-50', green: 'border-green-200 bg-green-50' }
  const textColors = { blue: 'text-blue-700', red: 'text-red-700', green: 'text-green-700' }

  return (
    <div className={`border rounded-lg p-3 text-center ${colors[color]}`}>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-xl font-bold font-mono ${textColors[color]}`}>{value}</div>
    </div>
  )
}
