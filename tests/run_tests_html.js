/* Executes tests.html (the browser suite) headlessly via jsdom to
   verify it runs clean. In a real browser it also fetches the shared
   cases table; under jsdom that section reports SKIP by design.
   Run: NODE_PATH=/tmp/smoke/node_modules node tests/run_tests_html.js */
const path = require('path');
const { JSDOM } = require('jsdom');
const { indexedDB, IDBKeyRange } = require('fake-indexeddb');

(async () => {
  const dom = await JSDOM.fromFile(path.join(__dirname, '..', 'tests.html'), {
    runScripts: 'dangerously',
    resources: 'usable',
    beforeParse(window) {
      window.indexedDB = indexedDB;
      window.IDBKeyRange = IDBKeyRange;
    },
  });
  const w = dom.window;
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 250));
    const s = w.document.getElementById('summary');
    if (s && s.textContent.trim()) {
      console.log(w.document.getElementById('output').textContent);
      console.log('SUMMARY:', s.textContent);
      process.exit(s.className === 'all-pass' ? 0 : 1);
    }
  }
  console.error('TIMEOUT: tests.html never finished');
  process.exit(1);
})();
