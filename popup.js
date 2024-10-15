document.getElementById('selectTable').addEventListener('click', () => {
    // Inject the content script into the current page
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        files: ['content.js']
      });
    });
    window.close();
  });
  