const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

async function req(path, opts = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

export const api = {
  // Accounts
  getAccounts: (userId)         => req(`/accounts?userId=${userId}`),
  deleteAccount: (id)           => req(`/accounts/${id}`, { method: 'DELETE' }),

  // Campaigns
  getCampaigns: (userId)        => req(`/campaigns?userId=${userId}`),
  createCampaign: (body)        => req('/campaigns', { method: 'POST', body: JSON.stringify(body) }),
  updateCampaign: (id, body)    => req(`/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteCampaign: (id)          => req(`/campaigns/${id}`, { method: 'DELETE' }),
  getCampaignStats: (id)        => req(`/campaigns/${id}/stats`),

  // Logs
  getLogs: (campaignId, limit = 100) => req(`/campaigns/${campaignId}/logs?limit=${limit}`)
}
