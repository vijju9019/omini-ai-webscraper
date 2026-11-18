/**
 * OmniScrape AI - Interactive Landing Page & Simulator Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  initSimulator();
  initFaqAccordion();
  initSmoothScroll();
});

// Preset Datasets
const PRESETS = {
  ecommerce: {
    name: 'TechMart Online Store',
    url: 'https://techmart.store/products/gadgets',
    records: [
      {
        title: 'Keychron Q1 Pro Wireless Custom Mechanical Keyboard',
        price: '$199.00',
        category: 'Electronics',
        category: 'Electronics',
        stock: 'In Stock'
      },
      {
        title: 'Sony WH-1000XM5 Noise Canceling Headphones',
        price: '$348.00',
        category: 'Audio',
        category: 'Audio',
        stock: 'In Stock'
      },
      {
        title: 'Logitech MX Master 3S Ergonomic Mouse',
        price: '$99.99',
        category: 'Accessories',
        category: 'Accessories',
        stock: 'Low Stock'
      },
      {
        title: 'Apple iPad Pro 11-inch M4 Ultra Retina Display',
        price: '$999.00',
        category: 'Computers',
        category: 'Computers',
        stock: 'In Stock'
      }
    ]
  },
  jobs: {
    name: 'RemoteTech Job Portal',
    url: 'https://remotetech.jobs/search?q=engineer',
    records: [
      {
        title: 'Staff Full Stack Engineer (TypeScript / Node)',
        company: 'Vercel Labs',
        location: 'Remote (Global)',
        salary: '$180,000 - $220,000',
        type: 'Full-time'
      },
      {
        title: 'Machine Learning Infrastructure Engineer',
        company: 'Anthropic AI',
        location: 'San Francisco, CA (Hybrid)',
        salary: '$210,000 - $260,000',
        type: 'Full-time'
      },
      {
        title: 'Senior Frontend Architect (Next.js & React 19)',
        company: 'Supabase Inc',
        location: 'Remote (US / EU)',
        salary: '$165,000 - $195,000',
        type: 'Contract'
      },
      {
        title: 'DevOps & Kubernetes Cloud Specialist',
        company: 'Linear App',
        location: 'Remote (Worldwide)',
        salary: '$170,000 - $210,000',
        type: 'Full-time'
      }
    ]
  },
  realestate: {
    name: 'Metropolitan Luxury Properties',
    url: 'https://metro-estates.com/listings/ny',
    records: [
      {
        title: 'Penthouse 48B - Tribeca Skyline View',
        price: '$4,250,000',
        details: '3 Beds • 3.5 Baths • 2,850 sqft',
        city: 'New York, NY',
        status: 'Active'
      },
      {
        title: 'Modern Minimalist Villa with Infinity Pool',
        price: '$2,890,000',
        details: '4 Beds • 4 Baths • 3,400 sqft',
        city: 'Austin, TX',
        status: 'Active'
      },
      {
        title: 'Historic Waterfront Brownstone Duplex',
        price: '$3,150,000',
        details: '3 Beds • 2.5 Baths • 2,200 sqft',
        city: 'Boston, MA',
        status: 'Pending'
      },
      {
        title: 'Architectural Hillside Glass Residence',
        price: '$5,900,000',
        details: '5 Beds • 6 Baths • 5,100 sqft',
        city: 'Los Angeles, CA',
        status: 'Active'
      }
    ]
  }
};

let currentPresetKey = 'ecommerce';
let extractedData = [];

function initSimulator() {
  const presetButtons = document.querySelectorAll('.preset-btn');
  const addressBar = document.getElementById('mock-address');
  const btnDetect = document.getElementById('btn-sim-detect');
  const btnExtract = document.getElementById('btn-sim-extract');

  // Preset switching
  presetButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      presetButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentPresetKey = btn.dataset.preset;
      renderMockCards();
      resetExtractionState();
      if (addressBar) {
        addressBar.textContent = PRESETS[currentPresetKey].url;
      }
    });
  });

  // Action: Detect Elements
  if (btnDetect) {
    btnDetect.addEventListener('click', () => {
      const cards = document.querySelectorAll('.mock-card');
      cards.forEach((card, idx) => {
        setTimeout(() => {
          card.classList.add('detected');
        }, idx * 120);
      });

      const clusterStatus = document.getElementById('status-cluster');
      if (clusterStatus) {
        clusterStatus.textContent = `Found 4 items (98.6% match)`;
        clusterStatus.style.color = 'var(--accent-emerald)';
      }

      showToast('Detected 4 repeating elements via Sibling Clustering');
    });
  }

  // Action: Extract Data
  if (btnExtract) {
    btnExtract.addEventListener('click', () => {
      // First ensure cards are highlighted
      document.querySelectorAll('.mock-card').forEach(c => c.classList.add('detected'));

      const clusterStatus = document.getElementById('status-cluster');
      if (clusterStatus) {
        clusterStatus.textContent = 'Extracting fields...';
      }

      btnExtract.disabled = true;
      btnExtract.textContent = 'Extracting...';

      const presetData = PRESETS[currentPresetKey].records;
      extractedData = [...presetData];

      setTimeout(() => {
        renderLiveTable(presetData);
        btnExtract.disabled = false;
        btnExtract.textContent = 'Extract Data';

        if (clusterStatus) {
          clusterStatus.textContent = `${presetData.length} records ready`;
          clusterStatus.style.color = 'var(--accent-cyan)';
        }

        showToast(`Extracted ${presetData.length} clean records with auto-classified headers!`);
      }, 500);
    });
  }

  // Export handlers
  setupExportButtons();

  // Initial render
  renderMockCards();
}

function renderMockCards() {
  const container = document.getElementById('mock-card-container');
  const brandTitle = document.getElementById('webpage-title');
  if (!container) return;

  const preset = PRESETS[currentPresetKey];
  if (brandTitle) brandTitle.textContent = preset.name;

  container.innerHTML = '';
  preset.records.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = 'mock-card';
    
    // Sub-markup according to preset type
    let metaMarkup = '';
    if (currentPresetKey === 'ecommerce') {
      metaMarkup = `
        <div class="mock-title">${item.title}</div>
        <div class="mock-meta">
          <span class="mock-price">${item.price}</span>
          <span class="mock-category">${item.category}</span>
        </div>
      `;
    } else if (currentPresetKey === 'jobs') {
      metaMarkup = `
        <div class="mock-title">${item.title}</div>
        <div style="font-size:0.75rem; color: #94a3b8;">${item.company} • ${item.location}</div>
        <div class="mock-meta" style="margin-top: 6px;">
          <span class="mock-price" style="font-size:0.75rem;">${item.salary}</span>
          <span style="font-size:0.7rem; background:rgba(37,99,235,0.15); padding:2px 6px; border-radius:4px; color:#60a5fa;">${item.type}</span>
        </div>
      `;
    } else {
      metaMarkup = `
        <div class="mock-title">${item.title}</div>
        <div style="font-size:0.75rem; color: #94a3b8;">${item.details}</div>
        <div class="mock-meta" style="margin-top: 6px;">
          <span class="mock-price">${item.price}</span>
          <span style="font-size:0.7rem; color: #6ee7b7;">${item.city}</span>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="mock-card-badge">CLUSTER #1</div>
      <div class="mock-image-box">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <circle cx="8.5" cy="8.5" r="1.5"></circle>
          <polyline points="21 15 16 10 5 21"></polyline>
        </svg>
      </div>
      ${metaMarkup}
    `;

    container.appendChild(card);
  });
}

function resetExtractionState() {
  const tableHead = document.querySelector('.preview-table thead');
  const tableBody = document.querySelector('.preview-table tbody');
  const clusterStatus = document.getElementById('status-cluster');

  if (tableHead) tableHead.innerHTML = '<tr><th>Field 1</th><th>Field 2</th><th>Field 3</th></tr>';
  if (tableBody) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="3" style="text-align: center; color: #64748b; padding: 24px;">
          Click "Auto-Detect" or "Extract Data" above to simulate live scraping
        </td>
      </tr>
    `;
  }
  if (clusterStatus) {
    clusterStatus.textContent = 'Idle (Ready)';
    clusterStatus.style.color = 'var(--text-muted)';
  }
  extractedData = [];
}

function renderLiveTable(data) {
  const tableHead = document.querySelector('.preview-table thead');
  const tableBody = document.querySelector('.preview-table tbody');
  if (!tableHead || !tableBody || data.length === 0) return;

  const headers = Object.keys(data[0]);

  // Headers
  let headerHtml = '<tr>';
  headers.forEach(h => {
    headerHtml += `<th>${h.toUpperCase()}</th>`;
  });
  headerHtml += '</tr>';
  tableHead.innerHTML = headerHtml;

  // Rows
  let bodyHtml = '';
  data.forEach(row => {
    bodyHtml += '<tr>';
    headers.forEach(h => {
      bodyHtml += `<td>${escapeHtml(row[h])}</td>`;
    });
    bodyHtml += '</tr>';
  });
  tableBody.innerHTML = bodyHtml;
}

function setupExportButtons() {
  const btnCsv = document.getElementById('export-csv');
  const btnJson = document.getElementById('export-json');
  const btnCopy = document.getElementById('export-copy');
  const btnExcel = document.getElementById('export-excel');

  if (btnCsv) {
    btnCsv.addEventListener('click', () => {
      const dataToExport = extractedData.length > 0 ? extractedData : PRESETS[currentPresetKey].records;
      downloadCsv(dataToExport, `omniscrape-${currentPresetKey}-export.csv`);
      showToast('CSV downloaded with UTF-8 BOM encoding');
    });
  }

  if (btnExcel) {
    btnExcel.addEventListener('click', () => {
      const dataToExport = extractedData.length > 0 ? extractedData : PRESETS[currentPresetKey].records;
      // Download as Excel compatible CSV or HTML table with excel mime
      downloadExcel(dataToExport, `omniscrape-${currentPresetKey}.xls`);
      showToast('Excel spreadsheet file created & downloaded');
    });
  }

  if (btnJson) {
    btnJson.addEventListener('click', () => {
      const dataToExport = extractedData.length > 0 ? extractedData : PRESETS[currentPresetKey].records;
      downloadJson(dataToExport, `omniscrape-${currentPresetKey}-export.json`);
      showToast('Formatted JSON file downloaded');
    });
  }

  if (btnCopy) {
    btnCopy.addEventListener('click', () => {
      const dataToExport = extractedData.length > 0 ? extractedData : PRESETS[currentPresetKey].records;
      copyTsv(dataToExport);
    });
  }
}

// Download Handlers
function downloadCsv(data, filename) {
  if (!data || data.length === 0) return;
  const headers = Object.keys(data[0]);
  
  // RFC-4180 with UTF-8 BOM
  const rows = [
    headers.map(h => `"${h.replace(/"/g, '""')}"`).join(',')
  ];

  data.forEach(row => {
    const line = headers.map(h => {
      const val = row[h] ? String(row[h]) : '';
      return `"${val.replace(/"/g, '""')}"`;
    }).join(',');
    rows.push(line);
  });

  const csvContent = '\uFEFF' + rows.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename);
}

function downloadExcel(data, filename) {
  if (!data || data.length === 0) return;
  const headers = Object.keys(data[0]);
  
  let tableHtml = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">';
  tableHtml += '<head><meta charset="utf-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>ScrapedData</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head><body>';
  tableHtml += '<table border="1"><thead><tr>';
  headers.forEach(h => {
    tableHtml += `<th style="background-color:#1e293b; color:#ffffff; font-weight:bold;">${escapeHtml(h)}</th>`;
  });
  tableHtml += '</tr></thead><tbody>';

  data.forEach(row => {
    tableHtml += '<tr>';
    headers.forEach(h => {
      tableHtml += `<td>${escapeHtml(row[h] || '')}</td>`;
    });
    tableHtml += '</tr>';
  });

  tableHtml += '</tbody></table></body></html>';

  const blob = new Blob([tableHtml], { type: 'application/vnd.ms-excel;charset=utf-8' });
  triggerDownload(blob, filename);
}

function downloadJson(data, filename) {
  const jsonContent = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
  triggerDownload(blob, filename);
}

function copyTsv(data) {
  if (!data || data.length === 0) return;
  const headers = Object.keys(data[0]);
  const lines = [headers.join('\t')];
  data.forEach(row => {
    lines.push(headers.map(h => (row[h] || '').replace(/\t|\n|\r/g, ' ')).join('\t'));
  });
  const tsv = lines.join('\n');
  navigator.clipboard.writeText(tsv).then(() => {
    showToast('Copied TSV! Ready to paste into Google Sheets or Excel');
  }).catch(() => {
    showToast('Clipboard access denied');
  });
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Toast notification helper
function showToast(message) {
  let toast = document.getElementById('toast-notification');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast-notification';
    toast.className = 'toast-notice';
    document.body.appendChild(toast);
  }
  toast.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" stroke-width="2">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
      <polyline points="22 4 12 14.01 9 11.01"></polyline>
    </svg>
    <span>${escapeHtml(message)}</span>
  `;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3500);
}

// FAQ Accordion
function initFaqAccordion() {
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach(item => {
    const question = item.querySelector('.faq-question');
    if (question) {
      question.addEventListener('click', () => {
        const isActive = item.classList.contains('active');
        faqItems.forEach(i => i.classList.remove('active'));
        if (!isActive) {
          item.classList.add('active');
        }
      });
    }
  });
}

// Smooth scrolling
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;
      const targetElement = document.querySelector(targetId);
      if (targetElement) {
        e.preventDefault();
        targetElement.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    });
  });
}
