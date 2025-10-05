chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const url = tabs[0].url;
  if (!url.includes('pendo.io')) {
    document.body.innerHTML = '<p>This extension only works on Pendo sites.</p>';
    return;
  }

  // Extract subscription ID from URL
  const match = url.match(/\/s\/(\d+)\//);
  if (!match) {
    document.body.innerHTML = '<p>Could not find subscription ID in URL.</p>';
    return;
  }
  const subid = match[1];

  document.getElementById('fetchData').addEventListener('click', async () => {
    const selectedOption = document.getElementById('options').value;
    let endpoint = '';

    if (selectedOption === 'exclude-server-domain') {
      endpoint = `https://app.pendo.io/api/s/${subid}/servername/flag/blacklisted?limit=1000&prefix=`;
    } else if (selectedOption === 'exclude-ip-address') {
      endpoint = `https://app.pendo.io/api/s/${subid}/blacklist/type/ip?limit=1000&prefix=`;
    } else if (selectedOption === 'exclude-visitor-id') {
      endpoint = `https://app.pendo.io/api/s/${subid}/blacklist/type/visitorId?limit=1000&prefix=`;
    } else if (selectedOption === 'exclude-account-id') {
      endpoint = `https://app.pendo.io/api/s/${subid}/blacklist/type/accountId?limit=1000&prefix=`;
    } else if (selectedOption === 'metadata-visitor') {
      endpoint = `https://app.pendo.io/api/s/${subid}/metadata/visitor/schema?cardinality=false`;
    } else if (selectedOption === 'metadata-account') {
      endpoint = `https://app.pendo.io/api/s/${subid}/metadata/account/schema?cardinality=false`;
    } else if (selectedOption === 'staging-server') {
      endpoint = `https://app.pendo.io/api/s/${subid}/servername/flag/staging?limit=1000&prefix=`;
    }

    if (!endpoint) {
      document.body.innerHTML = '<p>Invalid option selected.</p>';
      return;
    }

    try {
      // Inject script into the page to make the fetch with page cookies
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
          func: async (endpoint, selectedOption, subid) => {
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
              const fallback = `https://app.pendo.io/api/s/${subid}/blacklist/type/visitorIdGlob?limit=1000&prefix=`;
              console.log('visitor-id empty, trying fallback:', fallback);
              response = await fetch(fallback, { credentials: 'include', headers: headers, mode: 'cors' });
              if (response.ok) json = await response.json();
            }

            // Fallback for account-id: if results empty try accountIdGlob endpoint
            if (selectedOption === 'exclude-account-id' && Array.isArray(json.results) && json.results.length === 0) {
              const fallback2 = `https://app.pendo.io/api/s/${subid}/blacklist/type/accountIdGlob?limit=1000&prefix=`;
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
        args: [endpoint, selectedOption, subid]
      });
    } catch (error) {
      console.error('Error injecting script:', error);
      alert('Failed to inject script. Check console for details.');
    }
    window.close();
  });
});
  