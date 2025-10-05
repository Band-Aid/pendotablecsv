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
        files: ['content.js']
      });
    });
    window.close();
  });
});
  