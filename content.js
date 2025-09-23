(function() {
  let selectedTable;
  let collectedData = [];
  let isCollecting = false;

  const tables = document.querySelectorAll('table');
  tables.forEach((table) => {
    table.style.border = '2px solid transparent';
    table.addEventListener('mouseover', highlightTable);
    table.addEventListener('mouseout', resetTableStyle);
    table.addEventListener('click', selectTable);
  });

  function highlightTable(event) {
    event.target.closest('table').style.border = '2px solid blue';
  }

  function resetTableStyle(event) {
    event.target.closest('table').style.border = '2px solid transparent';
  }

  function selectTable(event) {
    event.preventDefault();
    event.stopPropagation();

    tables.forEach((table) => {
      table.removeEventListener('mouseover', highlightTable);
      table.removeEventListener('mouseout', resetTableStyle);
      table.removeEventListener('click', selectTable);
      table.style.border = '2px solid transparent';
    });

    selectedTable = event.target.closest('table');
    extractDataFromVirtualizedTable(selectedTable);
  }

  function findScrollableContainer(element) {
    let currentElement = element.parentElement;
    while (currentElement) {
      const overflowY = window.getComputedStyle(currentElement).overflowY;
      if (
        (overflowY === 'auto' || overflowY === 'scroll') &&
        currentElement.scrollHeight > currentElement.clientHeight
      ) {
        return currentElement;
      }
      currentElement = currentElement.parentElement;
    }
    return null;
  }

  function extractDataFromVirtualizedTable(table) {
    if (isCollecting) return;
    isCollecting = true;

    const scrollableContainer = findScrollableContainer(table);

    if (!scrollableContainer) {
      alert('Scrollable container not found.');
      isCollecting = false;
      return;
    }

    scrollableContainer.scrollTop = 0;

    const clientHeight = scrollableContainer.clientHeight;

    function collectData() {
      const rows = table.querySelectorAll('tbody tr');
      if (rows.length > 0) {
        rows.forEach((row, rowIndex) => {
         
          const cols = row.querySelectorAll('td, th');
          const rowData = [];
          cols.forEach((col, index) => {
           

            let data = '';
            let linkText = '';
            let href = '';
            let link = col.querySelector('a');

            let colClone = col.cloneNode(true);

            // Since I am not collecting the headers I need to remove data
            //Remove elements that contain the '+ x more rule' text.
            colClone.querySelectorAll('.additional-rules-link').forEach((el) => el.remove());
            //If value contains Disabled concat with last column - this is for super / apps page
            if (colClone.querySelector('.pendo-tag--warning')) {
              let disabled = colClone.querySelector('.pendo-tag--warning').innerText || colClone.querySelector('.pendo-tag--warning').textContent || '';
              disabled = disabled.trim();
              data = colClone.innerText || colClone.textContent || '';
              data = data.trim();
              data = data.replace(disabled, '').trim();
              data = data.replace(/"/g, '""');
              data = data.concat(' - ', disabled);
              
            } else
            

            if (link && link.href) {
              linkText = link.innerText || link.textContent || '';
              href = link.href;
              data = linkText.trim();
            } else {
              data = colClone.innerText || colClone.textContent || '';
              data = data.trim();
            }
            data = data.replace(/\+\s*\d+\s*more rule(s)?/i, '').trim();

            // Skip collecting data if it still contains 'more rule'
            if (/more rule/i.test(data)) {
              data = '';
            }

            data = data.replace(/"/g, '""');
            rowData.push(data);

            // Note: Extract href add 
            if (href) {
              href = href.replace(/"/g, '""');
              rowData.push(href);
            } else {
              // blanks can exist
              rowData.push('');
            }
          });
          collectedData.push(rowData);
        });
      }

      if (scrollableContainer.scrollTop + scrollableContainer.clientHeight >= scrollableContainer.scrollHeight) {
        isCollecting = false;
        collectedData = removeDuplicateRows(collectedData);
        chrome.runtime.sendMessage({ action: 'dataCollected', data: collectedData });
      } else {
        setTimeout(() => {
          const currentScroll = scrollableContainer.scrollTop;
          const newScroll = currentScroll + clientHeight * 0.8;
          scrollableContainer.scrollTop = newScroll;

          setTimeout(() => {
            collectData();
          }, 300);
        }, 100);
      }
    }

    collectData();
  }

  function removeDuplicateRows(data) {
    const uniqueRows = [];
    const rowSet = new Set();
    data.forEach((row) => {
      const rowString = row.join(',');
      if (!rowSet.has(rowString)) {
        rowSet.add(rowString);
        uniqueRows.push(row);
      }
    });
    return uniqueRows;
  }
})();
