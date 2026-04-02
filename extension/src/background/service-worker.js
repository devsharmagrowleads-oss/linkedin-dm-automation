/**
 * GrowLeads Connect — Service Worker
 * Single responsibility: read the li_at cookie from LinkedIn (httpOnly,
 * so content scripts cannot access it) and return it to the popup.
 */

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GL_GET_LI_AT') {
    // Fetch li_at and JSESSIONID together — LinkedIn expects both to be present.
    // JSESSIONID is the CSRF token; sending it from the browser avoids server-side
    // refresh failures caused by LinkedIn's bot detection.
    Promise.all([
      chrome.cookies.get({ url: 'https://www.linkedin.com', name: 'li_at' }),
      chrome.cookies.get({ url: 'https://www.linkedin.com', name: 'JSESSIONID' }),
    ]).then(([liAtCookie, jsessionCookie]) => {
      sendResponse({
        liAt:      liAtCookie?.value  ?? null,
        jsessionId: jsessionCookie?.value ?? null,
      })
    })
    return true // keep channel open for async response
  }
})
