'use client'

export default function TestLoginPage() {
  return (
    <div className="min-h-screen bg-blue-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
        <h1 className="text-2xl font-bold text-blue-600 mb-4">Test Login Page</h1>
        <p className="text-gray-600">This is a simple test to check if the page renders.</p>
        <button className="bg-blue-600 text-white px-4 py-2 rounded mt-4">
          Test Button
        </button>
      </div>
    </div>
  )
}