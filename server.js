'use strict';
// ATLAS live community server — native Node.js only, no npm dependencies.
// Local: node server.js  |  Public: deploy this folder and set PORT.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Optional full-resolution globe maps: download at build-time or upload these JPEGs to textures/.
const TEXTURE_FILES = ['8k_earth_daymap.jpg', '8k_earth_nightmap.jpg', '8k_earth_clouds.jpg'];
const TEXTURE_DIR = path.join(__dirname, 'textures');
function jpegDimensions(filename) {
  try {
    // Read only JPEG headers, not the entire 8K image (tens of MB) on each request.
    const info=fs.statSync(filename);
    if(info.size<130000)return null;
    const fd=fs.openSync(filename,'r');
    const data=Buffer.allocUnsafe(Math.min(info.size,262144));
    try{fs.readSync(fd,data,0,data.length,0)}finally{fs.closeSync(fd)}
    if (data[0] !== 0xff || data[1] !== 0xd8) return null;
    let p = 2;
    while (p + 9 < data.length) {
      if (data[p] !== 0xff) { p++; continue; }
      while (data[p] === 0xff) p++;
      const marker = data[p++];
      if (marker === 0xd8 || marker === 0xd9) continue;
      if (marker === 0xda) break;
      const length = data.readUInt16BE(p);
      if (length < 2 || p + length > data.length) break;
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
        return {width:data.readUInt16BE(p+5), height:data.readUInt16BE(p+3)};
      }
      p += length;
    }
  } catch {}
  return null;
}
function valid8kTexture(filename) {
  const dimensions = jpegDimensions(path.join(TEXTURE_DIR,filename));
  return !!(dimensions && dimensions.width >= 8000 && dimensions.height >= 4000);
}
// Retry 8K downloads after startup if the build encountered a temporary outage.
let textureLoadPending=false;
if(TEXTURE_FILES.some(name=>!valid8kTexture(name)) && process.env.ATLAS_SKIP_TEXTURE_DOWNLOAD!=='1'){
 textureLoadPending=true;
 const {installTextures}=require('./scripts/fetch-textures.js');
 installTextures().catch(err=>console.warn('ATLAS 8K runtime fetch:',err.message)).finally(()=>{textureLoadPending=false;});
}
const COOLDOWN_MS = 1000;
const MAX_TEXT = 280;
const MAX_HISTORY = 75;
const REGIONS = new Set(['North America', 'South America', 'Europe', 'Asia', 'Middle East', 'Oceania']);
const ALIASES = { '4': 'a', '@': 'a', '3': 'e', '1': 'i', '!': 'i', '|': 'i', '0': 'o', '$': 's', '5': 's', '7': 't', '+': 't' };
const SEVERE_SLURS = [
  /nigg(?:er|ers|a|as|ah|ahs|uh|uhs)/,
  /fagg?ot(?:s)?/,
  /wetback(?:s)?/,
  /raghead(?:s)?/,
  /towelhead(?:s)?/,
  /sandnigg(?:er|a)/,
  /chink(?:s)?/,
  /kike(?:s)?/,
  /spic(?:s)?/,
  /gook(?:s)?/,
  /trann(?:y|ies)/,
  /retard(?:s|ed)?/,
  /paki(?:s)?/,
  /dyke(?:s)?/,
  /beaner(?:s)?/
];
// This second check covers slurs deliberately split by spaces/dots/hyphens.
// Patterns here are long or distinctive enough to reduce false positives in ordinary words.
const OBFUSCATED_SLURS = [
  /nigg(?:er|a|ah|uh)/, /fagg?ot/, /wetback/, /raghead/, /towelhead/,
  /sandnigg/, /retard/, /tranny/, /beaner/
];
const SWEAR_WORDS = new Set([
  'fuck', 'fucking', 'fucked', 'fucker', 'fucks', 'motherfucker', 'motherfucking',
  'shit', 'shitty', 'bullshit', 'shits', 'bitch', 'bitches', 'bitching',
  'asshole', 'assholes', 'damn', 'damned', 'hell', 'crap', 'piss', 'pissed',
  'dick', 'dicks', 'wtf', 'lmfao'
]);
const RESERVED_NAMES = /(?:^|[^a-z])(admin|moderator|support|system|atlas staff)(?:$|[^a-z])/i;

function folded(value) {
  return String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[4@31!|0$57+]/g, c => ALIASES[c] || c)
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060\ufe0f]/g, '');
}
function noSlurs(value) {
  const words = folded(value).match(/[a-z]+/g) || [];
  if (words.some(word => SEVERE_SLURS.some(regex => new RegExp('^(?:' + regex.source + ')$').test(word)))) return false;
  const squeezed = words.join('');
  return !OBFUSCATED_SLURS.some(regex => regex.test(squeezed));
}
function swearCount(value) {
  return (folded(value).match(/[a-z]+/g) || []).filter(word => SWEAR_WORDS.has(word)).length;
}
function validateMessage(text) {
  if (typeof text !== 'string') return 'Enter a message.';
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > MAX_TEXT) return `Messages must be 1–${MAX_TEXT} characters.`;
  if (/[\u0000-\u0008\u000b-\u001f\u007f]/.test(trimmed)) return 'Remove control characters.';
  if (!noSlurs(trimmed)) return 'Slurs and hateful language are not allowed.';
  if (swearCount(trimmed) > 2) return 'Please limit swearing to two words per message.';
  if (/([!?.,])\1{12,}/.test(trimmed)) return 'Please avoid spam.';
  return null;
}
function validateName(name) {
  if (typeof name !== 'string' || name.length < 2 || name.length > 20) return 'Nickname must be 2–20 characters.';
  if (!/^[\p{L}\p{N}_ .-]+$/u.test(name)) return 'Nickname contains invalid characters.';
  if (!noSlurs(name) || swearCount(name) > 0 || RESERVED_NAMES.test(name)) return 'That nickname is not permitted.';
  return null;
}
function validRoom(room) {
  if (room === 'global') return true;
  if (typeof room !== 'string') return false;
  if (room.startsWith('region:')) return REGIONS.has(room.slice(7));
  return /^city:[a-z0-9-]{2,50}$/.test(room);
}
function safeTag(value) {
  if (typeof value !== 'string') return 'GLOBAL';
  const tag = value.trim().slice(0, 32);
  return /^[\p{L}\p{N} ·/._-]{1,32}$/u.test(tag) && noSlurs(tag) ? tag : 'GLOBAL';
}
function json(res, status, data, headers = {}) {
  const body = Buffer.from(JSON.stringify(data));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers
  });
  res.end(body);
}
function ipFor(req) {
  // Only trust forwarded addresses behind a proxy you explicitly control.
  if (process.env.TRUST_PROXY === '1' && req.headers['x-forwarded-for']) {
    return String(req.headers['x-forwarded-for']).split(',')[0].trim().slice(0, 100);
  }
  return req.socket.remoteAddress || 'unknown';
}
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) return reject({status: 415, error: 'Expected JSON.'});
    let total = 0;
    const parts = [];
    req.on('data', buf => {
      total += buf.length;
      if (total > 2048) { reject({status: 413, error: 'Request too large.'}); return; }
      parts.push(buf);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(parts).toString('utf8'))); }
      catch { reject({status: 400, error: 'Invalid JSON.'}); }
    });
    req.on('error', reject);
  });
}
function createApp({ dataDir = process.env.ATLAS_DATA_DIR || path.join(__dirname, 'chat-data'), siteDir = __dirname } = {}) {
  fs.mkdirSync(dataDir, {recursive: true});
  const logFile = path.join(dataDir, 'messages.jsonl');
  const reportsFile = path.join(dataDir, 'reports.jsonl');
  const rooms = new Map();
  const clients = new Map();
  const lastSent = new Map();
  const ipLimits = new Map();
  const reportLimits = new Map();
  const secret = crypto.randomBytes(32);
  let nextId = 0;
  if (fs.existsSync(logFile)) {
    // Local persistence; hosted free-tier instances may lose their filesystem on redeploy.
    for (const line of fs.readFileSync(logFile, 'utf8').split('\n')) {
      if (!line) continue;
      try {
        const m = JSON.parse(line);
        if (validRoom(m.room) && Number.isSafeInteger(m.id) && typeof m.text === 'string') {
          nextId = Math.max(nextId, m.id);
          if (!rooms.has(m.room)) rooms.set(m.room, []);
          const history = rooms.get(m.room);
          history.push(m);
          if (history.length > MAX_HISTORY) history.shift();
        }
      } catch { /* skip damaged line */ }
    }
  }
  function session(req, res) {
    const match = /(?:^|;\s*)atlas_sid=([a-f0-9]{48})\.([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '');
    if (match) {
      const expected = crypto.createHmac('sha256', secret).update(match[1]).digest('hex');
      if (crypto.timingSafeEqual(Buffer.from(match[2]), Buffer.from(expected))) return match[1];
    }
    const sid = crypto.randomBytes(24).toString('hex');
    const sig = crypto.createHmac('sha256', secret).update(sid).digest('hex');
    const secure = Boolean(req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https');
    res.setHeader('Set-Cookie', `atlas_sid=${sid}.${sig}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure ? '; Secure' : ''}`);
    return sid;
  }
  function checkOrigin(req) {
    if (!req.headers.origin) return true;
    try {
      const origin = new URL(req.headers.origin);
      return origin.host === req.headers.host && ['http:', 'https:'].includes(origin.protocol);
    } catch { return false; }
  }
  function pickHtml() {
    const max = path.join(siteDir, 'ATLAS Global 8K.html');
    return fs.existsSync(max) ? max : path.join(siteDir, 'ATLAS Global.html');
  }
  const server = http.createServer(async (req, res) => {
    let url;
    try { url = new URL(req.url, 'http://local.atlas'); }
    catch { return json(res, 400, {error:'Invalid URL.'}); }
    const pathname = url.pathname;
    if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
      const file = pickHtml();
      fs.stat(file, (err, stat) => {
        if (err) return json(res, 500, {error: 'Site file missing.'});
        res.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Content-Length':stat.size,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
        fs.createReadStream(file).pipe(res);
      });
      return;
    }
    if (req.method === 'GET' && pathname === '/api/texture-status') {
      const missing = TEXTURE_FILES.filter(filename => !valid8kTexture(filename));
      return json(res, 200, {available: missing.length===0, loading: textureLoadPending, missing});
    }
    if (req.method === 'GET' && pathname.startsWith('/textures/')) {
      const filename = pathname.slice('/textures/'.length);
      if (!TEXTURE_FILES.includes(filename) || !valid8kTexture(filename)) return json(res, 404, {error:'Texture is not installed.'});
      const image = path.join(TEXTURE_DIR, filename);
      const size = fs.statSync(image).size;
      res.writeHead(200, {
        'Content-Type':'image/jpeg', 'Content-Length':size,
        'Cache-Control':'public, max-age=86400', 'X-Content-Type-Options':'nosniff',
        'Access-Control-Allow-Origin':'*'
      });
      fs.createReadStream(image).pipe(res);return;
    }
    if (req.method === 'GET' && pathname === '/api/health') {
      return json(res, 200, { ok: true, chat: 'live', cooldownMs: COOLDOWN_MS });
    }
    if (req.method === 'GET' && pathname === '/api/history') {
      const room = url.searchParams.get('room');
      if (!validRoom(room)) return json(res, 400, {error:'Invalid room.'});
      session(req, res);
      return json(res, 200, {room, messages: rooms.get(room) || []});
    }
    if (req.method === 'GET' && pathname === '/api/stream') {
      const room = url.searchParams.get('room');
      if (!validRoom(room)) return json(res, 400, {error:'Invalid room.'});
      session(req, res);
      res.writeHead(200, {
        'Content-Type':'text/event-stream; charset=utf-8', 'Cache-Control':'no-cache, no-transform',
        'Connection':'keep-alive', 'X-Accel-Buffering':'no', 'X-Content-Type-Options':'nosniff'
      });
      res.write(': connected\n\n');
      if (!clients.has(room)) clients.set(room, new Set());
      clients.get(room).add(res);
      // Replay prevents the race between fetching history and starting SSE.
      for (const m of (rooms.get(room) || []).slice(-30)) res.write(`data: ${JSON.stringify(m)}\n\n`);
      const heartbeat = setInterval(() => { if (!res.destroyed) res.write(': ping\n\n'); }, 20000);
      req.on('close', () => { clearInterval(heartbeat); clients.get(room)?.delete(res); });
      return;
    }
    if (req.method === 'POST' && (pathname === '/api/message' || pathname === '/api/report')) {
      if (!checkOrigin(req)) return json(res, 403, {error:'Cross-origin requests are not allowed.'});
      const sid = session(req, res);
      const ip = ipFor(req);
      let body;
      try { body = await readJsonBody(req); }
      catch (err) { if (!res.destroyed) json(res, err.status || 400, {error: err.error || 'Invalid request.'}); return; }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return json(res, 400, {error:'Invalid request.'});
      const now = Date.now();
      if (pathname === '/api/report') {
        const count = (reportLimits.get(sid) || []).filter(t => now - t < 60000);
        if (count.length >= 5) return json(res, 429, {error:'Please slow down reporting.'});
        if (!Number.isSafeInteger(body.id)) return json(res, 400, {error:'Invalid message ID.'});
        const match = [...rooms.values()].some(messages => messages.some(m => m.id === body.id));
        if (!match) return json(res, 404, {error:'Message not found.'});
        count.push(now); reportLimits.set(sid, count);
        fs.appendFileSync(reportsFile, JSON.stringify({id:body.id, at:now, reporter:sid, ip})+'\n');
        return json(res, 200, {ok:true});
      }
      if (!validRoom(body.room)) return json(res, 400, {error:'Invalid chat room.'});
      const nameError = validateName(body.name);
      if (nameError) return json(res, 400, {error:nameError});
      const messageError = validateMessage(body.text);
      if (messageError) return json(res, 400, {error:messageError});
      if (typeof body.tag !== 'string' || body.tag.length > 32 || !noSlurs(body.tag)) return json(res, 400, {error:'Invalid location tag.'});
      const recent = lastSent.get(sid) || 0;
      if (now - recent < COOLDOWN_MS) {
        const retryAfterMs = COOLDOWN_MS - (now - recent);
        return json(res, 429, {error:'Wait 1 second between messages.', retryAfterMs}, {'Retry-After': String(Math.ceil(retryAfterMs/1000))});
      }
      // An IP-level longer-window cap also limits users who repeatedly clear cookies.
      const hits = (ipLimits.get(ip) || []).filter(t => now - t < 60000);
      if (hits.length >= 180) return json(res, 429, {error:'Too many messages from this connection. Try again shortly.', retryAfterMs:10000});
      const m = {
        id: ++nextId, room:body.room, name:body.name.trim(), tag:safeTag(body.tag),
        text:body.text.trim(), at:now
      };
      hits.push(now); ipLimits.set(ip, hits); lastSent.set(sid, now);
      if (!rooms.has(m.room)) rooms.set(m.room, []);
      const history = rooms.get(m.room);
      history.push(m);
      if (history.length > MAX_HISTORY) history.shift();
      fs.appendFileSync(logFile, JSON.stringify(m) + '\n');
      const data = `data: ${JSON.stringify(m)}\n\n`;
      for (const client of clients.get(m.room) || []) {
        if (!client.destroyed) client.write(data);
      }
      return json(res, 201, {ok:true, message:m, cooldownMs: COOLDOWN_MS});
    }
    return json(res, 404, {error:'Not found.'});
  });
  const cleanup = setInterval(() => {
    const cutoff = Date.now() - 60000;
    for (const [key, time] of lastSent) if (time < cutoff) lastSent.delete(key);
    for (const map of [ipLimits, reportLimits]) for (const [key, times] of map) {
      const filtered = times.filter(t => t > cutoff);
      if (filtered.length) map.set(key, filtered); else map.delete(key);
    }
  }, 30000);
  cleanup.unref();
  server.on('close', () => {
    clearInterval(cleanup);
    for (const set of clients.values()) for (const res of set) res.end();
  });
  return server;
}

if (require.main === module) {
  const port = Number(process.env.PORT || 8765);
  const host = process.env.HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1');
  createApp().listen(port, host, () => console.log(`ATLAS live chat ready: http://${host}:${port}`));
}
module.exports = {createApp, validateMessage, validateName, noSlurs, swearCount, validRoom};
