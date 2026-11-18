const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 4173;
const CDP_PORT = 9333; // Use 9333 to avoid conflict with Lenovo Vantage on 9222
const SNAPSHOT_DIR = path.join(__dirname, 'website', 'snapshots');
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA_DIR = path.join(__dirname, '.edge-shot-isolated');

if (!fs.existsSync(SNAPSHOT_DIR)) {
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let reqPath = req.url.split('?')[0];
      if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
      const filePath = path.join(__dirname, 'website', reqPath);
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.zip': 'application/zip'
      };
      const mime = mimeTypes[ext] || 'application/octet-stream';

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
        } else {
          res.writeHead(200, { 'Content-Type': mime });
          res.end(data);
        }
      });
    });

    server.listen(PORT, () => {
      console.log(`Server listening on http://localhost:${PORT}`);
      resolve(server);
    });
  });
}

function launchEdge() {
  const edgeArgs = [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-features=RendererCodeIntegrity',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-sync',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${USER_DATA_DIR}`,
    `http://localhost:${PORT}`
  ];

  console.log(`Spawning Edge process with port ${CDP_PORT}...`);
  return spawn(EDGE_PATH, edgeArgs, { stdio: 'ignore' });
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.msgId = 1;
    this.callbacks = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.callbacks.has(msg.id)) {
          const { res, rej } = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) rej(new Error(msg.error.message));
          else res(msg.result);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.msgId++;
      this.callbacks.set(id, { res: resolve, rej: reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    if (this.ws) {
      try { this.ws.close(); } catch(e){}
    }
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  const server = await startServer();
  const edgeProc = launchEdge();

  let wsUrl = null;
  for (let i = 0; i < 30; i++) {
    await sleep(400);
    try {
      const listRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
      const list = await listRes.json();
      console.log('Targets on', CDP_PORT, ':', list.map(t => `[${t.type}] ${t.title} (${t.url})`).join(' | '));
      const target = list.find(t => t.url && t.url.includes('4173') && t.webSocketDebuggerUrl) || list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      if (target) {
        wsUrl = target.webSocketDebuggerUrl;
        console.log('Connected to target:', target.title, target.url);
        break;
      }
    } catch (e) {
      // Waiting for port to open...
    }
  }

  if (!wsUrl) {
    throw new Error(`Failed to connect to page target on Edge port ${CDP_PORT}`);
  }

  const cdp = new CDPClient(wsUrl);
  await cdp.connect();
  console.log('Connected to CDP WebSocket');

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('DOM.enable');

  // Ultra-Crisp Viewport (1440x900 @ 2x = 2880x1800 HiDPI)
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 2,
    mobile: false
  });

  await sleep(1500);

  async function snap(filename) {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const filePath = path.join(SNAPSHOT_DIR, filename);
    fs.writeFileSync(filePath, Buffer.from(data, 'base64'));
    const stats = fs.statSync(filePath);
    console.log(`Saved snapshot: ${filename} (${(stats.size / 1024).toFixed(1)} KB)`);
  }

  // 1. Hero & Value Proposition
  console.log('1. Capturing Hero & Overview...');
  await cdp.send('Runtime.evaluate', { expression: 'window.scrollTo(0, 0)' });
  await sleep(600);
  await snap('01_hero_and_overview.png');

  // 2. Interactive Simulator - DOM Sibling Clustering
  console.log('2. Capturing DOM Sibling Clustering Detected...');
  await cdp.send('Runtime.evaluate', {
    expression: `
      const sim = document.getElementById('simulator');
      if (sim) sim.scrollIntoView({ behavior: 'instant', block: 'start' });
      const detectBtn = document.getElementById('btn-sim-detect');
      if (detectBtn) detectBtn.click();
    `
  });
  await sleep(1000);
  await snap('02_sibling_clustering_detected.png');

  // 3. Extracted Data Table Preview & Multi-Format Exporters
  console.log('3. Capturing Extracted Data Table...');
  await cdp.send('Runtime.evaluate', {
    expression: `
      const extractBtn = document.getElementById('btn-sim-extract');
      if (extractBtn) extractBtn.click();
    `
  });
  await sleep(1200);
  await snap('03_extracted_data_table.png');

  // 4. Multi-Domain Presets (Tech Jobs Catalog)
  console.log('4. Capturing Tech Jobs Preset...');
  await cdp.send('Runtime.evaluate', {
    expression: `
      const jobsBtn = document.getElementById('btn-preset-jobs');
      if (jobsBtn) jobsBtn.click();
      setTimeout(() => {
        const ext = document.getElementById('btn-sim-extract');
        if (ext) ext.click();
      }, 200);
    `
  });
  await sleep(1400);
  await snap('04_preset_tech_jobs.png');

  // 5. Architecture, Workflow & Store Compliance
  console.log('5. Capturing Architecture & Store Compliance...');
  await cdp.send('Runtime.evaluate', {
    expression: `
      const how = document.getElementById('how-it-works');
      if (how) how.scrollIntoView({ behavior: 'instant', block: 'start' });
    `
  });
  await sleep(600);
  await snap('05_workflow_and_privacy.png');

  console.log('ALL SNAPSHOTS GENERATED SUCCESSFULLY!');

  cdp.close();
  try { edgeProc.kill(); } catch (e) {}
  try { server.close(); } catch (e) {}
  try { fs.rmSync(USER_DATA_DIR, { recursive: true, force: true }); } catch (e) {}

  process.exit(0);
}

main().catch(err => {
  console.error('Capture error:', err);
  process.exit(1);
});
