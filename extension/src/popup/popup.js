/**
 * GrowLeads Connect — Popup
 *
 * Flow:
 *  1. Generate a userId UUID on first install (stored in chrome.storage.local)
 *  2. "Connect" button: get li_at from service worker → POST /accounts to backend
 *  3. Show connected profile name
 *  4. "Disconnect" clears stored account info
 */

// Change to your production URL when deploying
const API_BASE = 'http://localhost:3001'

// ── Helpers ────────────────────────────────────────────────────────────────

function generateUUID() {
  return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  )
}

async function getOrCreateUserId() {
  const stored = await chrome.storage.local.get('gl_userId')
  if (stored.gl_userId) return stored.gl_userId
  const id = generateUUID()
  await chrome.storage.local.set({ gl_userId: id })
  return id
}

function shortId(id) {
  return id.slice(0, 8) + '...' + id.slice(-4)
}

async function getLiAt() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'GL_GET_LI_AT' }, res => {
      resolve(res?.liAt ?? null)
    })
  })
}

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.style.display = 'none')
  document.getElementById('view' + name).style.display = 'block'
}

function setStatus(text, color) {
  const badge = document.getElementById('statusBadge')
  badge.textContent = text
  badge.style.background = color === 'green' ? '#22c55e'
                         : color === 'red'   ? '#ef4444'
                         : '#6b7280'
}

function copyToClipboard(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.innerHTML
    btn.textContent = '✓'
    setTimeout(() => { btn.innerHTML = orig }, 1500)
  })
}

// ── Init ───────────────────────────────────────────────────────────────────

async function init() {
  const userId = await getOrCreateUserId()
  const stored = await chrome.storage.local.get('gl_account')
  const account = stored.gl_account

  document.getElementById('userId').textContent = shortId(userId)
  document.getElementById('connectedUserId').textContent = shortId(userId)

  if (account) {
    showConnected(account, userId)
  } else {
    showView('Connect')
    setStatus('Not connected', 'gray')
  }

  document.getElementById('btnConnect').addEventListener('click', () => connect(userId))
  document.getElementById('btnRefresh').addEventListener('click', () => connect(userId))
  document.getElementById('btnDisconnect').addEventListener('click', disconnect)

  document.getElementById('btnCopyId').addEventListener('click', e => {
    copyToClipboard(userId, e.currentTarget)
  })
  document.getElementById('btnCopyConnectedId').addEventListener('click', e => {
    copyToClipboard(userId, e.currentTarget)
  })
}

// ── Connect ────────────────────────────────────────────────────────────────

async function connect(userId) {
  const errEl = document.getElementById('connectError')
  errEl.style.display = 'none'

  showView('Loading')
  setStatus('Connecting...', 'gray')

  const { liAt, jsessionId } = await getLiAt()
  if (!liAt) {
    showView('Connect')
    setStatus('Not connected', 'gray')
    errEl.textContent = 'Could not read LinkedIn session. Make sure you\'re logged into LinkedIn in this browser.'
    errEl.style.display = 'block'
    return
  }

  let data
  try {
    const res = await fetch(`${API_BASE}/accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, liAt, jsessionId })
    })
    data = await res.json()
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  } catch (err) {
    showView('Connect')
    setStatus('Not connected', 'gray')
    errEl.textContent = err.message.includes('fetch')
      ? 'Cannot reach GrowLeads server. Is it running?'
      : err.message
    errEl.style.display = 'block'
    return
  }

  const account = data.account
  await chrome.storage.local.set({ gl_account: account })
  showConnected(account, userId)
}

function showConnected(account, userId) {
  const name = account.profileName || 'LinkedIn User'
  document.getElementById('profileName').textContent = name
  document.getElementById('profileInitials').textContent =
    name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  document.getElementById('connectedUserId').textContent = shortId(userId)

  showView('Connected')
  setStatus('Connected', 'green')
}

// ── Disconnect ─────────────────────────────────────────────────────────────

async function disconnect() {
  const stored = await chrome.storage.local.get('gl_account')
  if (stored.gl_account?.id) {
    fetch(`${API_BASE}/accounts/${stored.gl_account.id}`, { method: 'DELETE' }).catch(() => {})
  }
  await chrome.storage.local.remove('gl_account')
  showView('Connect')
  setStatus('Not connected', 'gray')
}

init()
