const $ = (id) => document.getElementById(id);

const setStatus = (message, meta = '') => {
  const status = $('status');
  const statusMsg = $('statusMsg');
  const statusMeta = $('statusMeta');
  if (!status || !statusMsg || !statusMeta) return;
  status.classList.add('show');
  statusMsg.textContent = message;
  statusMeta.textContent = meta;
};

const setSitePill = ({ ok, text }) => {
  const siteText = $('siteText');
  const siteDot = $('siteDot');
  if (siteText) siteText.textContent = text;
  if (siteDot) {
    siteDot.classList.remove('ok', 'bad');
    if (ok === true) siteDot.classList.add('ok');
    if (ok === false) siteDot.classList.add('bad');
  }
};

const setBusy = (busy) => {
  const button = $('fetchData');
  const select = $('options');
  if (button) button.disabled = busy;
  if (select) select.disabled = busy;
  if (button) button.textContent = busy ? 'Exporting…' : 'Export CSV';
};

const showError = (message) => {
  setSitePill({ ok: false, text: 'Not ready' });
  setStatus(message);
  const select = $('options');
  if (select) select.classList.add('error');
  setBusy(false);
};

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const activeTab = tabs && tabs[0];
  const url = activeTab && activeTab.url ? String(activeTab.url) : '';
  let apiBase = null;
  try {
    const u = new URL(url);
    // Use the same scheme + host as the tab (supports app.pendo.io, app.jpn.pendo.io, etc.)
    apiBase = `${u.protocol}//${u.host}`;
  } catch (e) {
    apiBase = null;
  }

  const hostOk = !!apiBase && apiBase.includes('pendo.io');
  if (!hostOk) {
    setSitePill({ ok: false, text: 'Open a Pendo tab' });
    showError('This extension only works on Pendo sites (app.*.pendo.io).');
    return;
  }

  setSitePill({ ok: true, text: 'Pendo detected' });

  // Extract subscription ID from URL
  const match = url.match(/\/s\/(\d+)\//);
  if (!match) {
    showError('Could not find subscription ID in the current URL. Open a Pendo page with /s/{subId}/ in the path.');
    return;
  }
  const subid = match[1];
  setStatus('Ready to export.', `sub ${subid}`);

  $('fetchData').addEventListener('click', async () => {
    const selectedOption = $('options').value;
    let endpoint = '';

    if (selectedOption === 'exclude-server-domain') {
      endpoint = `${apiBase}/api/s/${subid}/servername/flag/blacklisted?limit=1000&prefix=`;
    } else if (selectedOption === 'exclude-ip-address') {
      endpoint = `${apiBase}/api/s/${subid}/blacklist/type/ip?limit=1000&prefix=`;
    } else if (selectedOption === 'exclude-visitor-id') {
      endpoint = `${apiBase}/api/s/${subid}/blacklist/type/visitorId?limit=1000&prefix=`;
    } else if (selectedOption === 'exclude-account-id') {
      endpoint = `${apiBase}/api/s/${subid}/blacklist/type/accountId?limit=1000&prefix=`;
    } else if (selectedOption === 'metadata-visitor') {
      endpoint = `${apiBase}/api/s/${subid}/metadata/visitor/schema?cardinality=false`;
    } else if (selectedOption === 'metadata-account') {
      endpoint = `${apiBase}/api/s/${subid}/metadata/account/schema?cardinality=false`;
    } else if (selectedOption === 'staging-server') {
      endpoint = `${apiBase}/api/s/${subid}/servername/flag/staging?limit=1000&prefix=`;
    }

    if (!endpoint) {
      showError('Invalid option selected.');
      return;
    }

    try {
      setBusy(true);
      setStatus('Requesting data…', `sub ${subid}`);
      // Inject script into the page to make the fetch with page cookies
      chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
          func: async (endpoint, selectedOption, subid, apiBase) => {
          console.log('Fetching endpoint (page context):', endpoint);
          try {
            // Capture PendoXSRFToken cookie
            const captureCookie = (name) => {
              try {
                const re = new RegExp('(?:^|; )' + name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '=([^;]+)');
                const m = (document.cookie || '').match(re);
                return m ? m[1] : null;
              } catch (e) { return null; }
            };
            const preCookieValue = captureCookie('PendoXSRFToken');
            let token = null;
            let foundSource = null;
            let foundKey = null;

            if (!token) {
              try {
                const cookieNames = ['PendoXSRFToken'];
                const dc = document.cookie || '';
                for (const name of cookieNames) {
                  const re = new RegExp('(?:^|; )' + name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '=([^;]+)');
                  const m = dc.match(re);
                  if (m) {
                    token = decodeURIComponent(m[1]);
                    foundSource = 'cookie';
                    foundKey = name;
                    break;
                  }
                }
              } catch (e) {}
            }

            if (token) {
              try {
                token = String(token).trim();
                // strip surrounding single/double quotes
                token = token.replace(/^\"|\"$/g, '');
                token = token.replace(/^\'|\'$/g, '');
                // try decode if percent-encoded
                try { token = decodeURIComponent(token); } catch (e) {  }
              } catch (e) {}
            }
            console.log('token discovered?', !!token, 'source=', foundSource, 'key=', foundKey);

            const headers = {
              'accept': 'application/json, text/plain, */*',
              'X-Requested-With': 'XMLHttpRequest'
            };
            if (token) {
              headers['x-pendo-xsrf-token'] = token;
            }

            let response = await fetch(endpoint, { credentials: 'include', headers: headers, mode: 'cors' });

            console.log('Response status:', response.status);
            if (!response.ok) {
              const errorText = await response.text();
              console.log('Error response:', errorText);
              chrome.runtime.sendMessage({ action: 'fetchError', error: `HTTP ${response.status}`, debug: { status: response.status, source: foundSource, key: foundKey } });
              return;
            }
            let json = await response.json();

            // Fallback for visitor-id: if results empty try visitorIdGlob endpoint
            if (selectedOption === 'exclude-visitor-id' && Array.isArray(json.results) && json.results.length === 0) {
              const fallback = `${apiBase}/api/s/${subid}/blacklist/type/visitorIdGlob?limit=1000&prefix=`;
              console.log('visitor-id empty, trying fallback:', fallback);
              response = await fetch(fallback, { credentials: 'include', headers: headers, mode: 'cors' });
              if (response.ok) json = await response.json();
            }

            // Fallback for account-id: if results empty try accountIdGlob endpoint
            if (selectedOption === 'exclude-account-id' && Array.isArray(json.results) && json.results.length === 0) {
              const fallback2 = `${apiBase}/api/s/${subid}/blacklist/type/accountIdGlob?limit=1000&prefix=`;
              console.log('account-id empty, trying fallback:', fallback2);
              response = await fetch(fallback2, { credentials: 'include', headers: headers, mode: 'cors' });
              if (response.ok) json = await response.json();
            }
            console.log('Fetched data:', json);
            // Verify PendoXSRFToken hasn't been changed by this script (we do not write/delete this token)
            const postCookieValue = captureCookie('PendoXSRFToken');
            const cookieChanged = (preCookieValue !== postCookieValue);
            if (cookieChanged) {
              console.warn('PendoXSRFToken or meta storage changed during fetch', { cookieChanged });
              // report but do not include sensitive values
              chrome.runtime.sendMessage({ action: 'fetchError', error: 'Token or meta changed during fetch. Cancelling for security reasons.', debug: { cookieChanged, source: foundSource, key: foundKey } });
            }
            chrome.runtime.sendMessage({ action: 'dataFetched', data: json, selectedOption: selectedOption, subid: subid, debug: { source: foundSource, key: foundKey, cookieChanged } });
          } catch (error) {
            console.error('Fetch error (page):', error);
            chrome.runtime.sendMessage({ action: 'fetchError', error: error.message });
          }
        },
        args: [endpoint, selectedOption, subid, apiBase]
      });
    } catch (error) {
      console.error('Error injecting script:', error);
      showError('Failed to inject script. Check extension console for details.');
      return;
    }
    // background.js will handle download; close the popup for a clean flow
    window.close();
  });
});
  