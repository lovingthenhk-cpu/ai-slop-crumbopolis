// Run with: node --test tests/history.test.cjs (Node.js 18+, no dependencies)
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const page = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = page.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, 'inline application script exists');
const instrumented = script.replace(/\}\)\(\);\s*$/, `
  globalThis.simulationTest = {
    update,
    history: () => [...state.history],
    tax: value => { state.tax = value; }
  };
})();`);
assert.notEqual(instrumented, script, 'test hooks added to existing application');

function boot(saved = null) {
  const nodes = new Map();
  function element(id) {
    if (!nodes.has(id)) {
      nodes.set(id, {
        textContent: '', innerHTML: '',
        getContext: () => ({}),
        addEventListener: () => {},
        getBoundingClientRect: () => ({width: 300, height: 200}),
      });
    }
    return nodes.get(id);
  }
  const document = {
    querySelector: selector => element(selector),
    querySelectorAll: () => [],
    getElementById: id => element(id),
    addEventListener: () => {},
  };
  const context = {
    document,
    localStorage: {getItem: () => saved === null ? null : JSON.stringify(saved)},
    performance: {now: () => 0},
    ResizeObserver: class {observe() {}},
    requestAnimationFrame() {},
    setInterval() {},
  };
  vm.runInNewContext(instrumented, context);
  return context.simulationTest;
}

test('fiscal samples are recorded once per 1,500 simulation ticks even at the 45-point cap', () => {
  const app = boot({crumbs: [], history: [0]});
  for (let i = 1; i <= 50; i++) {
    app.tax(i);
    app.update(1500);
  }
  assert.equal(app.history().length, 45);
  assert.equal(app.history().at(-1), 50);
  app.tax(999);
  app.update(1); // Same time bucket: must NOT replace the last saved point.
  assert.equal(app.history().at(-1), 50);
  app.update(1499); // Next boundary: sample once.
  assert.equal(app.history().at(-1), 999);
  assert.equal(app.history().length, 45);
});

test('a restored city keeps its history but records new samples on time', () => {
  const app = boot({crumbs: [], history: Array(25).fill(7), tax: 77});
  assert.equal(app.history().length, 25);
  app.update(1499);
  assert.equal(app.history().length, 25);
  app.update(1);
  assert.equal(app.history().length, 26);
  assert.equal(app.history().at(-1), 77);
});
