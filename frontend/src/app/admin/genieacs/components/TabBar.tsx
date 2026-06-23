export default function TabBar({ tabs, active, onChange }: {
  tabs: string[]
  active: number
  onChange: (index: number) => void
}) {
  return (
    <div className="flex border-b border-gray-200">
      {tabs.map((tab, i) => (
        <button
          key={tab}
          onClick={() => onChange(i)}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            i === active
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {tab}
        </button>
      ))}
    </div>
  )
}
