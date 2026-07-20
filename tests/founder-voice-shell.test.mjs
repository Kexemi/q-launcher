import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');

function scriptBody() {
  const blocks = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
  return blocks.map(match => match[1]).join('\n');
}

const js = scriptBody();

test('Founder voice is a first-class calm Owner App pane with explicit privacy state', () => {
  for (const marker of [
    'id="founder-view"',
    'id="founder-ptt"',
    'id="founder-privacy"',
    'id="founder-transcript"',
    'id="founder-response"',
    'id="founder-context"',
    'id="founder-cursor"',
    'Available',
    'Listening',
    'Transcribing',
    'Thinking',
    'Speaking',
    'Muted',
    'Error',
    'Tap to talk',
    'Not listening',
  ]) assert.ok(html.includes(marker), `missing ${marker}`);
  assert.ok(!/always listening|ambient listening/i.test(html));
});

test('microphone capture can begin only inside the PTT click path and always releases tracks', () => {
  assert.ok(js.includes('function startFounderListening'));
  assert.ok(js.includes("founderPtt.addEventListener('click'"));
  assert.ok(js.includes('navigator.mediaDevices.getUserMedia'));
  assert.equal((js.match(/navigator\.mediaDevices\.getUserMedia/g) || []).length, 1);
  const start = js.indexOf('function startFounderListening');
  const stop = js.indexOf('function stopFounderListening');
  assert.ok(start >= 0 && stop > start);
  assert.ok(js.slice(start, stop).includes('getUserMedia'));
  assert.ok(js.includes('getTracks().forEach'));
  assert.ok(js.includes('track.stop()'));
  for (const autoHook of ['pageshow', 'visibilitychange', 'focus', 'online']) {
    const hook = js.match(new RegExp(`addEventListener\\(['\"]${autoHook}['\"][\\s\\S]{0,240}`));
    if (hook) assert.ok(!hook[0].includes('startFounderListening'), `${autoHook} must not start microphone`);
  }
});

test('Founder turn uses the existing authenticated runtime and persists one cursor across reloads', () => {
  assert.ok(js.includes('/api/founder/state'));
  assert.ok(js.includes('/api/founder/turn'));
  assert.ok(js.includes("'X-AIOS-Token'"));
  assert.ok(js.includes('client_turn_id'));
  assert.ok(js.includes('founderCursor'));
  assert.ok(js.includes('.dataset.cursor=founderCursor'));
  assert.ok(js.includes('pageshow'));
  assert.ok(js.includes('visibilitychange'));
  assert.ok(js.includes('online'));
});

test('spoken output has a text twin plus honest mute and local cancel controls', () => {
  assert.ok(html.includes('id="founder-mute"'));
  assert.ok(html.includes('id="founder-cancel"'));
  assert.ok(js.includes('speechSynthesis.speak'));
  assert.ok(js.includes('speechSynthesis.cancel'));
  assert.ok(html.includes('Spoken on this device'));
  assert.ok(js.includes('response_text'));
  assert.ok(js.includes('running server turn'));
});

test('state refresh cannot hide an active local recording', () => {
  const start = js.indexOf('function renderFounderState');
  const end = js.indexOf('async function loadFounderState');
  const render = js.slice(start, end);
  assert.ok(render.includes('founderRecorder?.state==="recording"'));
  assert.ok(render.includes('founderStateLabel("Listening")'));
  assert.ok(render.includes('Listening now'));
  assert.ok(render.indexOf('founderRecorder?.state==="recording"') < render.indexOf('founderStateLabel("Available")'));
});

test('playback failure preserves the text twin and local cancel preserves server-turn truth', () => {
  const speakStart = js.indexOf('function speakFounder');
  const speakEnd = js.indexOf('async function submitFounderAudio');
  const speak = js.slice(speakStart, speakEnd);
  assert.ok(speak.includes('the full text response remains below'));
  assert.ok(!speak.includes('founderStateLabel("Error","'));
  const cancel = js.match(/#founder-cancel[\s\S]{0,700}/)?.[0] || '';
  assert.ok(cancel.includes('S.founderBusy?"Thinking"'));
  assert.ok(cancel.includes('a running server turn, if any, continues safely'));
});

test('completed phone turns surface Founder response and prior voice context before transcript', () => {
  const responseAt = html.indexOf('id="founder-response"');
  const transcriptAt = html.indexOf('id="founder-transcript"');
  assert.ok(responseAt >= 0 && transcriptAt > responseAt);
  assert.ok(js.includes('classList.toggle("has-turns",turns.length>0)'));
  assert.ok(js.includes('Earlier voice · '));
  assert.ok(html.includes('.founder-shell.has-turns'));
  assert.ok(html.includes('FOUNDER_CONTEXT_MAX_CHARS=96'));
  assert.ok(html.includes('-webkit-line-clamp:2'));
  assert.ok(html.includes('.founder-context[hidden]{display:none}'));
  assert.ok(js.includes('founderContextSummary(earlierVoice)'));
});

test('completed desktop turns use available width so the full response stays above navigation', () => {
  assert.ok(html.includes('class="founder-copy founder-response-card"'));
  assert.ok(html.includes('class="founder-copy founder-transcript-card"'));
  assert.ok(html.includes('@media(min-width:700px) and (max-height:950px)'));
  assert.ok(html.includes('grid-template-areas:"presence response" "context response" "meta response"'));
  assert.ok(html.includes('.founder-shell.has-turns .founder-response-card{grid-area:response}'));
  assert.ok(html.includes('id="founder-history-wrap"'));
  assert.ok(html.includes('<summary>Earlier turns</summary>'));
  assert.ok(html.includes('.founder-shell.has-turns .founder-history-wrap{grid-area:history}'));
  assert.ok(js.includes('historyWrap.hidden=!turns.length'));
});
