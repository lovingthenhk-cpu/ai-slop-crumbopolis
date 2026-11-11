const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function element(tag) {
  return {
    tag,
    children: [],
    replaceChildren(...nodes) { this.children = nodes; },
    append(...nodes) { this.children.push(...nodes); },
    set textContent(value) { this.children = [{text: String(value)}]; },
    get textContent() { return this.children.map(n => n.text ?? n.textContent ?? '').join(''); },
    set innerHTML(_) { throw new Error('Unsafe HTML rendering'); },
  };
}

test('saved announcements stay literal text, including HTML-looking content', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const match = html.match(/function log\(s\)\{[\s\S]*?\}\nfunction save\(\)/);
  assert.ok(match, 'log() should appear before save()');
  const logElement = element('div');
  const oldMessage = '<svg onload=alert(2)></svg>';
  const state = {events: [{t:'11:00', s: oldMessage}]};
  const doc = {
    createElement: element,
    createTextNode(text) { return {text: String(text)}; },
  };
  const sandbox = {state, document: doc, $: () => logElement, Date};
  vm.runInNewContext(match[0].replace(/\nfunction save\(\)$/, '') + '\nlog("'+ 'new message' +'");', sandbox);
  assert.equal(logElement.children.length, 2);
  assert.equal(logElement.children[0].textContent.includes('new message'), true);
  assert.equal(logElement.children[1].textContent.includes(oldMessage), true);
  assert.equal(logElement.children[1].children[1].text, oldMessage);
  assert.equal(state.events.length, 2);
});

test('the log remains capped to seven announcements', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const match = html.match(/function log\(s\)\{[\s\S]*?\}\nfunction save\(\)/);
  assert.ok(match);
  const logElement = element('div');
  const state = {events: Array.from({length: 12}, (_, i) => ({t:'12:00',s:'old'+i}))};
  vm.runInNewContext(match[0].replace(/\nfunction save\(\)$/, '') + '\nlog("new");', {
    state, document: {createElement: element,createTextNode: text => ({text: String(text)})},
    $: () => logElement, Date,
  });
  assert.equal(state.events.length, 7);
  assert.equal(logElement.children.length, 7);
  assert.equal(logElement.children[0].children[1].text, 'new');
});
