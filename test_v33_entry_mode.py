# v3.3 verification: entry-mode setting (type vs tap), same-element
# keyboard advance, input/buffer double-fire guard, mode persistence.
# Run: python3 test_v33_entry_mode.py   (serves the app dir on :8766, headless Chromium)
import http.server, threading, functools, os, json
from playwright.sync_api import sync_playwright

DIR = os.path.dirname(os.path.abspath(__file__))
PORT = 8766
results = {"pass": 0, "fail": 0}

def check(name, cond, extra=None):
    if cond:
        results["pass"] += 1
        print("  PASS", name)
    else:
        results["fail"] += 1
        print("  FAIL", name, json.dumps(extra, default=str) if extra is not None else "")

def run():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=DIR)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        console_errors = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: console_errors.append(str(e)))

        page.goto(f"http://127.0.0.1:{PORT}/index.html")
        page.wait_for_timeout(500)

        for n in ["Ann Lee", "Ben Moss", "Cy Park"]:
            page.evaluate("async (name) => { await dbPut('students', { name, sid: '', period: 1 }); }", n)

        # --- Default mode is 'type' on a fresh install ---
        check("default entryMode is 'type'", page.evaluate("() => settings.entryMode") == "type")

        page.click('.nav button[data-page="entry"]')
        page.wait_for_timeout(300)
        first_date = page.eval_on_selector("#entry-tbody .code-cell", "c => c.dataset.date")
        col = f'.code-cell[data-date="{first_date}"]'

        # --- Click opens inline input, not the picker ---
        page.click(f'#entry-tbody tr:first-child {col}')
        page.wait_for_timeout(100)
        check("click opens inline input", page.eval_on_selector("#entry-tbody", "t => !!t.querySelector('input.inline-code-input')"))
        check("picker modal stays closed", not page.eval_on_selector("#code-modal", "m => m.classList.contains('open')"))

        # --- Buffer guard: typing in the input must NOT trigger the
        # cell-level key buffer (which applies after 300ms and steals focus)
        page.evaluate("() => { document.querySelector('input.inline-code-input')._tag = 'KEEP_ME'; }")
        page.keyboard.type("NP")
        page.wait_for_timeout(450)  # past the 300ms buffer timer
        state = page.evaluate("""(col) => {
            const cells = [...document.querySelectorAll(col)];
            const inp = document.querySelector('input.inline-code-input');
            return { inputAlive: !!inp, inRow0: !!(inp && cells[0].contains(inp)),
                     val: inp && inp.value, cell0code: cells[0].dataset.code };
        }""", col)
        check("input still open in row 1 after 450ms (buffer did not fire)",
              state["inputAlive"] and state["inRow0"], state)
        check("typed value intact (no double-processing)", state["val"] == "NP", state)

        # --- Enter: SAME element advances to row 2; code committed + persisted ---
        page.keyboard.press("Enter")
        page.wait_for_timeout(150)
        adv = page.evaluate("""(col) => {
            const cells = [...document.querySelectorAll(col)];
            const inp = document.querySelector('input.inline-code-input');
            return { sameEl: !!(inp && inp._tag === 'KEEP_ME'), inRow1: !!(inp && cells[1].contains(inp)),
                     cell0: cells[0].dataset.code, focused: document.activeElement === inp };
        }""", col)
        check("SAME input element moved to row 2 (iPad keyboard persists)", adv["sameEl"] and adv["inRow1"], adv)
        check("input is focused after advance", adv["focused"], adv)
        check("row 1 committed NP", adv["cell0"] == "NP", adv)
        sid0 = page.eval_on_selector(f'#entry-tbody tr:first-child {col}', "c => c.dataset.student")
        saved = page.evaluate("async ([sid, d]) => { const e = await dbGet('entries', `${sid}_${d}`); return e && e.code; }", [int(sid0), first_date])
        check("row 1 NP persisted to IndexedDB", saved == "NP", saved)

        # --- Invalid code: no advance, input alive ---
        page.keyboard.type("ZZZ")
        page.keyboard.press("Enter")
        page.wait_for_timeout(150)
        inv = page.evaluate("""(col) => {
            const cells = [...document.querySelectorAll(col)];
            const inp = document.querySelector('input.inline-code-input');
            return { alive: !!inp, inRow1: !!(inp && cells[1].contains(inp)) };
        }""", col)
        check("invalid code keeps input in row 2 (no advance)", inv["alive"] and inv["inRow1"], inv)
        page.keyboard.press("Escape")
        page.wait_for_timeout(200)

        # --- Switch to 'tap' mode via the Settings radio (end to end) ---
        page.click('.nav button[data-page="settings"]')
        page.wait_for_timeout(300)
        check("settings radio shows 'type' selected", page.eval_on_selector("#entry-mode-type", "r => r.checked"))
        page.check("#entry-mode-tap")
        page.wait_for_timeout(200)
        page.click('.nav button[data-page="entry"]')
        page.wait_for_timeout(300)
        page.click(f'#entry-tbody tr:first-child {col}')
        page.wait_for_timeout(150)
        check("tap mode: picker opens", page.eval_on_selector("#code-modal", "m => m.classList.contains('open')"))
        check("tap mode: no inline input", not page.eval_on_selector("#entry-tbody", "t => !!t.querySelector('input.inline-code-input')"))

        # --- Pick a code from the panel; it saves ---
        page.click('#picker-codes .code-btn[data-code="A"]')
        page.wait_for_timeout(300)
        cell0 = page.eval_on_selector(f'#entry-tbody tr:first-child {col}', "c => c.dataset.code")
        check("picker selection saved (A)", cell0 == "A", cell0)

        # --- Mode persists across reload ---
        page.reload()
        page.wait_for_timeout(600)
        check("entryMode 'tap' persisted after reload", page.evaluate("() => settings.entryMode") == "tap")

        check("zero console errors", len(console_errors) == 0, console_errors)
        browser.close()

    print(f"\nTOTAL: {results['pass']} passed, {results['fail']} failed")
    return results["fail"]

if __name__ == "__main__":
    raise SystemExit(run())
