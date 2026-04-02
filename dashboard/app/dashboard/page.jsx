'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '../../lib/api'

// ── Small reusable components ───────────────────────────────────────────────

function Badge({ status }) {
  const map = {
    active:       'bg-green-500/20 text-green-400 border-green-500/30',
    paused:       'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    invalid:      'bg-red-500/20 text-red-400 border-red-500/30',
    rate_limited: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  }
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${map[status] || 'bg-slate-700 text-slate-400 border-slate-600'}`}>
      {status}
    </span>
  )
}

function Btn({ onClick, children, variant = 'ghost', disabled }) {
  const styles = {
    ghost:   'bg-slate-700 hover:bg-slate-600 text-slate-200',
    danger:  'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30',
    primary: 'bg-indigo-600 hover:bg-indigo-500 text-white',
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 ${styles[variant]}`}
    >
      {children}
    </button>
  )
}

const DEFAULT_TEMPLATE = `Hey {firstName}! I saw you commented on the post 👋

Here's the resource I mentioned: {resourceUrl}

Let me know if you have any questions!`

// ── Campaign Form Modal ─────────────────────────────────────────────────────

function CampaignModal({ userId, accounts, onSave, onClose }) {
  const [form, setForm] = useState({
    name: '', postUrl: '', resourceUrl: '',
    accountId: accounts[0]?.id || '',
    messageTemplate: DEFAULT_TEMPLATE
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function submit(e) {
    e.preventDefault()
    setErr('')
    setSaving(true)
    try {
      await api.createCampaign({ userId, ...form })
      onSave()
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <h2 className="font-semibold">New Campaign</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">×</button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          {accounts.length > 1 && (
            <Field label="LinkedIn Account" required>
              <select value={form.accountId} onChange={e => set('accountId', e.target.value)}
                required className="gl-input">
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>{a.profileName}</option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Campaign Name" required>
            <input value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="e.g. Free SEO Checklist" required
              className="gl-input" />
          </Field>
          <Field label="LinkedIn Post URL" hint="The post you want to monitor for new commenters" required>
            <input value={form.postUrl} onChange={e => set('postUrl', e.target.value)}
              placeholder="https://www.linkedin.com/posts/..." required
              className="gl-input" />
          </Field>
          <Field label="Lead Magnet URL" hint="Sent to every new commenter in the DM" required>
            <input value={form.resourceUrl} onChange={e => set('resourceUrl', e.target.value)}
              placeholder="https://yoursite.com/resource" required
              className="gl-input" />
          </Field>
          <Field label="Message Template" hint="Variables: {firstName} {lastName} {fullName} {resourceUrl}">
            <textarea value={form.messageTemplate} onChange={e => set('messageTemplate', e.target.value)}
              rows={6} required className="gl-input resize-none" />
          </Field>
          {err && <p className="text-red-400 text-sm bg-red-500/10 rounded-lg px-3 py-2">{err}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-slate-600 text-sm text-slate-300 hover:bg-slate-800 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors disabled:opacity-50">
              {saving ? 'Creating…' : 'Create Campaign'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({ label, hint, required, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </div>
  )
}

// ── Activity Log Panel ──────────────────────────────────────────────────────

function LogPanel({ campaignId, onClose }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getLogs(campaignId).then(d => { setLogs(d.logs); setLoading(false) })
    const t = setInterval(() => api.getLogs(campaignId).then(d => setLogs(d.logs)), 10_000)
    return () => clearInterval(t)
  }, [campaignId])

  const levelColor = { INFO: 'text-slate-300', WARN: 'text-yellow-400', ERROR: 'text-red-400' }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-700 shrink-0">
          <h2 className="font-semibold">Activity Log</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">×</button>
        </div>
        <div className="overflow-y-auto flex-1 p-4 space-y-1.5">
          {loading && <p className="text-slate-500 text-sm">Loading…</p>}
          {!loading && logs.length === 0 && <p className="text-slate-500 text-sm">No activity yet. The campaign polls every 2 minutes.</p>}
          {logs.map(log => (
            <div key={log.id} className="flex gap-3 text-xs font-mono">
              <span className="text-slate-500 shrink-0">{new Date(log.createdAt).toLocaleTimeString()}</span>
              <span className={`shrink-0 w-10 ${levelColor[log.level]}`}>{log.level}</span>
              <span className="text-slate-300">{log.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main Dashboard ──────────────────────────────────────────────────────────

export default function Dashboard() {
  const router = useRouter()
  const [userId,    setUserId]    = useState(null)
  const [accounts,  setAccounts]  = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [showForm,  setShowForm]  = useState(false)
  const [logFor,    setLogFor]    = useState(null)  // campaignId
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')

  const load = useCallback(async (uid) => {
    try {
      const [a, c] = await Promise.all([api.getAccounts(uid), api.getCampaigns(uid)])
      setAccounts(a.accounts)
      setCampaigns(c.campaigns)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const uid = localStorage.getItem('gl_userId')
    if (!uid) { router.replace('/'); return }
    setUserId(uid)
    load(uid)
    const t = setInterval(() => load(uid), 15_000)
    return () => clearInterval(t)
  }, [router, load])

  async function toggleCampaign(c) {
    const newStatus = c.status === 'active' ? 'paused' : 'active'
    await api.updateCampaign(c.id, { status: newStatus })
    load(userId)
  }

  async function deleteCampaign(id) {
    if (!confirm('Delete this campaign? This cannot be undone.')) return
    await api.deleteCampaign(id)
    load(userId)
  }

  function signOut() {
    localStorage.removeItem('gl_userId')
    router.push('/')
  }

  if (!userId) return null

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <span className="font-bold text-lg">GrowLeads</span>
        <div className="flex items-center gap-4">
          <span className="text-xs text-slate-500 font-mono">{userId.slice(0, 8)}…</span>
          <button onClick={signOut} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-8">

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 text-sm">
            Cannot reach backend: {error}. Make sure the server is running on port 3001.
          </div>
        )}

        {/* Accounts section */}
        <section>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">LinkedIn Accounts</h2>
          {loading ? (
            <div className="bg-slate-800/50 rounded-xl p-4 text-slate-500 text-sm">Loading…</div>
          ) : accounts.length === 0 ? (
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-sm text-slate-400">
              No LinkedIn account connected. Open the <strong className="text-slate-200">GrowLeads Chrome extension</strong> and click "Connect LinkedIn Account".
            </div>
          ) : (
            <div className="space-y-2">
              {accounts.map(account => (
                <div key={account.id} className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-bold">
                      {(account.profileName || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{account.profileName}</p>
                      <p className="text-xs text-slate-500">
                        Verified {account.lastVerifiedAt ? new Date(account.lastVerifiedAt).toLocaleDateString() : '—'}
                      </p>
                    </div>
                  </div>
                  <Badge status={account.status} />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Campaigns section */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Campaigns</h2>
            {accounts.length > 0 && (
              <button
                onClick={() => setShowForm(true)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
              >
                + New Campaign
              </button>
            )}
          </div>

          {loading ? (
            <div className="bg-slate-800/50 rounded-xl p-4 text-slate-500 text-sm">Loading…</div>
          ) : campaigns.length === 0 ? (
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-8 text-center">
              <p className="text-slate-400 text-sm mb-1">No campaigns yet</p>
              <p className="text-slate-600 text-xs">Create a campaign to start sending DMs automatically</p>
            </div>
          ) : (
            <div className="space-y-3">
              {campaigns.map(c => (
                <div key={c.id} className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{c.name}</p>
                      <p className="text-xs text-slate-500 truncate mt-0.5">{c.postUrl}</p>
                      {c.account && (
                        <p className="text-xs text-slate-600 mt-0.5">{c.account.profileName}</p>
                      )}
                    </div>
                    <Badge status={c.status} />
                  </div>

                  <div className="flex items-center gap-4 text-xs text-slate-400 mb-3">
                    <span>
                      <span className="font-semibold text-slate-200">{c._count?.sentDms ?? c.dmsSent ?? 0}</span> DMs sent
                    </span>
                    {c.lastPolledAt && (
                      <span>Last poll: {new Date(c.lastPolledAt).toLocaleTimeString()}</span>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Btn onClick={() => toggleCampaign(c)}>
                      {c.status === 'active' ? 'Pause' : 'Resume'}
                    </Btn>
                    <Btn onClick={() => setLogFor(c.id)}>View Logs</Btn>
                    <Btn onClick={() => deleteCampaign(c.id)} variant="danger">Delete</Btn>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {showForm && accounts.length > 0 && (
        <CampaignModal
          userId={userId}
          accounts={accounts}
          onSave={() => { setShowForm(false); load(userId) }}
          onClose={() => setShowForm(false)}
        />
      )}

      {logFor && (
        <LogPanel campaignId={logFor} onClose={() => setLogFor(null)} />
      )}
    </div>
  )
}
