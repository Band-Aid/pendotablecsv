chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'downloadCSV') {
    downloadCSV(message.csv);
  } else if (message.action === 'dataFetched') {
    const json = message.data;
    const selectedOption = message.selectedOption;
    const subid = message.subid || 'unknown';
    
    let dataToConvert;
    if (selectedOption === 'exclude-server-domain') {
      dataToConvert = json.results.map(item => ({ name: item.name }));
    } else if (selectedOption === 'exclude-ip-address') {
      dataToConvert = json.results.map(item => ({ id: item.id, name: item.name, type: item.type }));
    } else if (selectedOption === 'exclude-visitor-id') {
      dataToConvert = json.results.map(item => ({ id: item.id, name: item.name, type: item.type }));
    } else if (selectedOption === 'exclude-account-id') {
      dataToConvert = json.results.map(item => ({ id: item.id, name: item.name, type: item.type }));
      } else if (selectedOption === 'staging-server') {
        dataToConvert = json.results.map(item => ({ id: item.id, name: item.name, staging: item.flags && item.flags.staging, lastUpdatedAt: item.lastUpdatedAt }));
    } else if (selectedOption === 'metadata-visitor') {
   
      const rows = [];
      for (const groupName of Object.keys(json || {})) {
        const group = json[groupName];
        if (!group || typeof group !== 'object') continue;
        for (const fieldName of Object.keys(group)) {
          const field = group[fieldName];
          if (!field) continue;
          if (field.isHidden || field.isDeleted) continue;
          const displayName = (field.DisplayName && String(field.DisplayName).trim()) ? field.DisplayName : fieldName;
          rows.push({ group: groupName, field: fieldName, Type: field.Type || '', DisplayName: displayName, sample: field.sample || '' });
        }
      }
      dataToConvert = rows;
    } else if (selectedOption === 'metadata-account') {
      const rowsA = [];
      for (const groupName of Object.keys(json || {})) {
        const group = json[groupName];
        if (!group || typeof group !== 'object') continue;
        for (const fieldName of Object.keys(group)) {
          const field = group[fieldName];
          if (!field) continue;
          if (field.isHidden || field.isDeleted) continue;
          const displayNameA = (field.DisplayName && String(field.DisplayName).trim()) ? field.DisplayName : fieldName;
          rowsA.push({ group: groupName, field: fieldName, Type: field.Type || '', DisplayName: displayNameA, sample: field.sample || '' });
        }
      }
      dataToConvert = rowsA;
    } else {
      dataToConvert = json; 
    }
    
    const csv = jsonToCsv(dataToConvert);
    const filename = `${subid}_${selectedOption}.csv`;
    downloadCSV(csv, filename);
  } else if (message.action === 'fetchError') {
    console.error('Fetch error:', message.error);
  }
});

function downloadCSV(csvContent, filename = 'data.csv') {
  const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
  const csvData = new Blob([bom, csvContent], { type: 'text/csv' });

  const reader = new FileReader();

  reader.onload = function(e) {
    const url = e.target.result;

    chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: true,
    }, () => {
      console.log('CSV download initiated', filename);
    });
  };

  reader.readAsDataURL(csvData);
}

function jsonToCsv(json) {
  if (!Array.isArray(json) || json.length === 0) return '';
  const headers = Object.keys(json[0]);
  const csvRows = [];
  csvRows.push(headers.join(','));
  json.forEach(row => {
    const values = headers.map(header => {
      let val = row[header] || '';
      val = val.toString().replace(/"/g, '""');
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        val = '"' + val + '"';
      }
      return val;
    });
    csvRows.push(values.join(','));
  });
  return csvRows.join('\n');
}
