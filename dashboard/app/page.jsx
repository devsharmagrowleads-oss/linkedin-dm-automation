'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()
  const [userId, setUserId] = useState('')
  const [err, setErr]       = useState('')

  useEffect(() => {
    const stored = localStorage.getItem('gl_userId')
    if (stored) router.replace('/dashboard')
  }, [router])

  function handleSubmit(e) {
    e.preventDefault()
    const id = userId.trim()
    if (!id || id.length < 8) { setErr('Paste the User ID shown in your GrowLeads extension.'); return }
    localStorage.setItem('gl_userId', id)
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-1">GrowLeads</h1>
        <p className="text-slate-400 text-sm mb-8">
          Paste the User ID from your Chrome extension to continue.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            autoFocus
            value={userId}
            onChange={e => { setUserId(e.target.value); setErr('') }}
            placeholder="Paste your User ID…"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-sm font-mono placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
          {err && <p className="text-red-400 text-xs">{err}</p>}
          <button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-lg text-sm transition-colors"
          >
            Open Dashboard
          </button>
        </form>
      </div>
    </div>
  )
}
