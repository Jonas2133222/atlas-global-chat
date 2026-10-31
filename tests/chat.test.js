'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { createApp, validateMessage, validateName, validRoom } = require('../server');

const forbiddenExamples = ['n1gg3r', 'f.a.g.g.o.t', 'wet-back', 'r e t a r d'];

test('message filter permits a little swearing, not slurs or excessive swearing', () => {
  assert.equal(validateMessage('Oh shit, that was damn crazy'), null);
  assert.equal(validateMessage('spicy food, please'), null);
  assert.equal(validateMessage('fuck fuck fuck'), 'Please limit swearing to two words per message.');
  for (const slur of forbiddenExamples) assert.match(validateMessage(slur), /Slurs/);
  assert.equal(validateName('NightOwl'), null);
  assert.match(validateName('admin'), /not permitted/);
  assert.match(validateName('f.a.g.g.o.t'), /not permitted/);
  assert.equal(validRoom('region:Asia'), true);
  assert.equal(validRoom('city:tokyo'), true);
  assert.equal(validRoom('city:../../etc'), false);
});

test('two clients see real messages, server enforces cooldown and reports', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-chat-'));
  const app = createApp({dataDir, siteDir:path.resolve(__dirname, '..')});
  await new Promise(ok => app.listen(0, '127.0.0.1', ok));
  t.after(async () => { app.closeAllConnections(); await new Promise(ok => app.close(ok)); fs.rmSync(dataDir, {recursive:true,force:true}); });
  const base = `http://127.0.0.1:${app.address().port}`;
  async function client() {
    const resp = await fetch(base+'/api/history?room=global');
    assert.equal(resp.status, 200);
    return resp.headers.get('set-cookie').split(';')[0];
  }
  async function send(cookie, text, room='global', name='NightOwl') {
    return fetch(base+'/api/message', {
      method:'POST', headers:{'content-type':'application/json',cookie},
      body:JSON.stringify({room, name, tag:'NA·VAN', text})
    });
  }
  const cookieA = await client();
  const cookieB = await client();
  assert.notEqual(cookieA, cookieB);
  const stream = await fetch(base+'/api/stream?room=global', {headers:{cookie:cookieB}});
  assert.equal(stream.status, 200);
  assert.match(stream.headers.get('content-type'), /text\/event-stream/);
  const reader = stream.body.getReader();
  const first = await send(cookieA, 'Hello from Vancouver');
  assert.equal(first.status, 201);
  const m = (await first.json()).message;
  assert.equal(m.text, 'Hello from Vancouver');
  let received = '';
  const deadline = Date.now() + 2500;
  while (!received.includes('Hello from Vancouver') && Date.now() < deadline) {
    const event = await Promise.race([reader.read(), new Promise((_, reject)=>setTimeout(()=>reject(Error('SSE timeout')), 2800))]);
    received += Buffer.from(event.value).toString();
  }
  assert.match(received, /Hello from Vancouver/);
  assert.equal((await send(cookieA, 'immediately again')).status, 429);
  assert.equal((await send(cookieB, 'second user can message')).status, 201);
  const roomHistory = await (await fetch(base+'/api/history?room=global')).json();
  assert.equal(roomHistory.messages.length, 2);
  const separate = await (await fetch(base+'/api/history?room=region:Asia')).json();
  assert.equal(separate.messages.length, 0);
  assert.equal((await send(cookieA, 'fuck fuck fuck')).status, 400);
  assert.equal((await send(cookieA, 'n1gg3r')).status, 400);
  const report = await fetch(base+'/api/report',{method:'POST',headers:{cookie:cookieB,'content-type':'application/json'},body:JSON.stringify({id:m.id})});
  assert.equal(report.status, 200);
  assert.match(fs.readFileSync(path.join(dataDir,'reports.jsonl'),'utf8'), /"id":1/);
  assert.equal((await fetch(base+'/api/health')).status, 200);
  await reader.cancel();
  await new Promise(ok=>setTimeout(ok, 1010));
  assert.equal((await send(cookieA, 'after cooldown')).status, 201);
  assert.equal(fs.readFileSync(path.join(dataDir,'messages.jsonl'),'utf8').trim().split('\n').length, 3);
});
