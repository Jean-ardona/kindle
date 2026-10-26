const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const { ingestMessage, snapshot, subscribe, setQuestionStatus, splitMergedMessage, greetNewcomer, setOnScreen, clearScreen, setTheme, setLessAnimation, setStreamerLang, reset } = require('./store');
const ROOT = __dirname;
function sendJson(res, code, value) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}
function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 65536) { reject(Object.assign(new Error('Request body too large'), { statusCode: 413 })); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch { reject(Object.assign(new Error('Invalid JSON'), { statusCode: 400 })); }
    });
    req.on('error', reject);
  });
}
function serveFile(res, filename) {
  fs.readFile(path.join(ROOT, filename), (error, contents) => {
    if (error) return sendJson(res, 404, { error: 'Page not found' });
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(contents);
  });
}
function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/api/state') return sendJson(res, 200, snapshot());
    if (req.method === 'GET' && url.pathname === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' });
      res.write('event: state\ndata: ' + JSON.stringify(snapshot()) + '\n\n');
      const unsubscribe = subscribe((state) => res.write('event: state\ndata: ' + JSON.stringify(state) + '\n\n'));
      const heartbeat = setInterval(() => res.write(': keepalive\n\n'), 20000);
      res.on('close', () => { clearInterval(heartbeat); unsubscribe(); });
      return;
    }
    try {
      if (req.method === 'POST' && url.pathname === '/api/message') {
        const result = ingestMessage(await readJson(req));
        return sendJson(res, 200, result.state);
      }
      if (req.method === 'POST' && url.pathname === '/api/screen/clear') {
        const result = clearScreen();
        return sendJson(res, 200, result.state);
      }
      const screenMatch = url.pathname.match(/^\/api\/screen\/(\d+)$/);
      if (req.method === 'POST' && screenMatch) {
        const result = setOnScreen(Number(screenMatch[1]));
        return result.error ? sendJson(res, result.statusCode, { error: result.error }) : sendJson(res, 200, result.state);
      }
      if (req.method === 'POST' && url.pathname === '/api/theme') {
        const body = await readJson(req);
        const result = setTheme(body.theme);
        return result.error ? sendJson(res, result.statusCode, { error: result.error }) : sendJson(res, 200, result.state);
      }
      if (req.method === 'POST' && url.pathname === '/api/lang') {
        const body = await readJson(req);
        const result = setStreamerLang(body.streamerLang || body.lang);
        return result.error ? sendJson(res, result.statusCode, { error: result.error }) : sendJson(res, 200, result.state);
      }
      if (req.method === 'POST' && url.pathname === '/api/animation') {
        const body = await readJson(req);
        return sendJson(res, 200, setLessAnimation(body.lessAnimation).state);
      }
      if (req.method === 'POST' && url.pathname === '/api/reset') return sendJson(res, 200, reset());
      const questionMatch = url.pathname.match(/^\/api\/questions\/(\d+)\/(answer|skip)$/);
      if (req.method === 'POST' && questionMatch) {
        const result = setQuestionStatus(Number(questionMatch[1]), questionMatch[2] === 'answer' ? 'answered' : 'skipped');
        return result.error ? sendJson(res, result.statusCode, { error: result.error }) : sendJson(res, 200, result.state);
      }
      const splitMatch = url.pathname.match(/^\/api\/questions\/(\d+)\/split$/);
      if (req.method === 'POST' && splitMatch) {
        const body = await readJson(req);
        const result = splitMergedMessage(Number(splitMatch[1]), Number(body.index));
        return result.error ? sendJson(res, result.statusCode, { error: result.error }) : sendJson(res, 200, result.state);
      }
      const greetMatch = url.pathname.match(/^\/api\/newcomers\/([^/]+)\/greet$/);
      if (req.method === 'POST' && greetMatch) {
        const result = greetNewcomer(decodeURIComponent(greetMatch[1]));
        return result.error ? sendJson(res, result.statusCode, { error: result.error }) : sendJson(res, 200, result.state);
      }
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/panel' || url.pathname === '/panel/')) return serveFile(res, 'index.html');
      if (req.method === 'GET' && (url.pathname === '/simulator' || url.pathname === '/simulator/')) return serveFile(res, 'simulator.html');
      if (req.method === 'GET' && (url.pathname === '/overlay' || url.pathname === '/overlay/')) return serveFile(res, 'overlay.html');
      sendJson(res, 404, { error: 'Not found' });
    } catch (error) {
      sendJson(res, error.statusCode || 400, { error: error.message || 'Request failed' });
    }
  });
}
if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  createServer().listen(port, () => {
    console.log('Kindle is running at http://localhost:' + port + '/panel');
    require('./twitch').startTwitchChat();
  });
}
module.exports = { createServer, ingestMessage };
