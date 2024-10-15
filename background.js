chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'dataCollected') {
    //console.log('Received data:', message.data);
    generateCSV(message.data);
  }
});

function generateCSV(data) {
  const csvContent = data.map(row => row.join(',')).join('\n');
  const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
  const csvData = new Blob([bom,csvContent], { type: 'text/csv' });

  const reader = new FileReader();

  reader.onload = function(e) {
    const url = e.target.result;

    chrome.downloads.download({
      url: url,
      filename: 'table.csv',
      saveAs: true,
    }, () => {
      console.log('CSV download ');
    });
  };

  reader.readAsDataURL(csvData);
}
