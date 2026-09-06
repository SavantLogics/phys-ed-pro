# v3.2 verification: last-name sort, row numbers, iPad keyboard focus retention.
# Run: python3 test_v32_fixes.py   (serves the app dir on :8765, headless Chromium)
import http.server, threading, functools, os, sys, json
from playwright.sync_api import sync_playwright

DIR = os.path.dirname(os.path.abspath(__file__))
PORT = 8765
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

        # Seed roster: out of last-name order, mixed name formats
        names = ["Charlie Adams", "Alice Zimmer", "Bob Baker", "Dana Baker", "Evans, Frank", "Maria de la Cruz"]
        for n in names:
            page.evaluate("async (name) => { await dbPut('students', { name, sid: '', period: 1 }); }", n)

        expected = ["Charlie Adams", "Bob Baker", "Dana Baker", "Maria de la Cruz", "Evans, Frank", "Alice Zimmer"]

        # --- Roster page: sort + numbers ---
        page.click('.nav button[data-page="roster"]')
        page.wait_for_timeout(300)
        roster = page.eval_on_selector_all(
            "#student-list .student-row",
            "rows => rows.map(r => ({num: r.querySelector('.num').textContent, name: r.querySelector('.name').textContent}))")
        check("roster sorted by last name", [r["name"] for r in roster] == expected, [r["name"] for r in roster])
        check("roster numbers 1..6", [r["num"] for r in roster] == ["1", "2", "3", "4", "5", "6"], [r["num"] for r in roster])

        # --- Entry grid: sort + fixed row numbers ---
        page.click('.nav button[data-page="entry"]')
        page.wait_for_timeout(300)
        grid = page.eval_on_selector_all(
            "#entry-tbody .name-cell",
            "cells => cells.map(c => ({num: c.querySelector('.row-num').textContent, title: c.getAttribute('title')}))")
        check("grid sorted by last name", [g["title"] for g in grid] == expected, [g["title"] for g in grid])
        check("grid row numbers fixed 1..6", [g["num"] for g in grid] == ["1.", "2.", "3.", "4.", "5.", "6."], [g["num"] for g in grid])

        # --- Keyboard flow: click Monday cell of row 1, type A, Enter ---
        first_date = page.eval_on_selector("#entry-tbody .code-cell", "c => c.dataset.date")
        page.click(f'#entry-tbody tr:first-child .code-cell[data-date="{first_date}"]')
        page.wait_for_timeout(100)
        check("input opened in cell 1", page.query_selector("#entry-tbody tr:first-child .code-cell input") is not None)

        page.keyboard.type("A")
        page.keyboard.press("Enter")
        # Focus must move synchronously (this is the iPad-keyboard guarantee)
        focus_info = page.evaluate("""(d) => {
            const ae = document.activeElement;
            if (!ae || !ae.classList.contains('inline-code-input')) return { ok: false, tag: ae && ae.tagName };
            const cell = ae.closest('.code-cell'); const row = ae.closest('tr');
            return { ok: true, date: cell.dataset.date, rowIndex: [...row.parentNode.children].indexOf(row) };
        }""", first_date)
        check("focus advanced to next student same day (no re-render, keyboard survives)",
              focus_info.get("ok") and focus_info.get("date") == first_date and focus_info.get("rowIndex") == 1, focus_info)

        page.keyboard.type("NP")
        page.keyboard.press("Enter")
        focus2 = page.evaluate("""() => {
            const ae = document.activeElement; const row = ae && ae.closest('tr');
            return { isInput: !!(ae && ae.classList.contains('inline-code-input')),
                     rowIndex: row ? [...row.parentNode.children].indexOf(row) : -1 };
        }""")
        check("focus advanced again to row 3", focus2["isInput"] and focus2["rowIndex"] == 2, focus2)
        page.keyboard.press("Escape")

        # --- Persistence + in-place Pts/Comment refresh ---
        page.wait_for_timeout(500)
        cell1 = page.eval_on_selector(f'#entry-tbody tr:nth-child(1) .code-cell[data-date="{first_date}"]', "c => c.textContent.trim()")
        cell2 = page.eval_on_selector(f'#entry-tbody tr:nth-child(2) .code-cell[data-date="{first_date}"]', "c => c.textContent.trim()")
        check("cell 1 shows A", cell1 == "A", cell1)
        check("cell 2 shows NP", cell2 == "NP", cell2)
        pts1 = page.eval_on_selector("#entry-tbody tr:nth-child(1) .pts-cell", "c => c.textContent.trim()")
        pts2 = page.eval_on_selector("#entry-tbody tr:nth-child(2) .pts-cell", "c => c.textContent.trim()")
        check("row 1 pts 90 (A deducts 10)", pts1 == "90", pts1)
        check("row 2 pts 90 (NP deducts 10)", pts2 == "90", pts2)
        comment1 = page.eval_on_selector("#entry-tbody tr:nth-child(1) .comment-cell", "c => c.textContent")
        check("row 1 comment mentions absence", "absence" in comment1.lower(), comment1)

        db_entries = page.evaluate("async () => (await dbGetAll('entries')).map(e => e.code).sort()")
        check("2 entries persisted in IndexedDB", db_entries == ["A", "NP"], db_entries)

        # --- Survives reload ---
        page.reload()
        page.wait_for_timeout(500)
        page.click('.nav button[data-page="entry"]')
        page.wait_for_timeout(300)
        after_reload = page.eval_on_selector(f'#entry-tbody tr:nth-child(1) .code-cell[data-date="{first_date}"]', "c => c.textContent.trim()")
        check("entry survives reload", after_reload == "A", after_reload)

        # --- Invalid code path: focus stays, nothing saved ---
        page.click(f'#entry-tbody tr:nth-child(4) .code-cell[data-date="{first_date}"]')
        page.keyboard.type("ZZ")
        page.keyboard.press("Enter")
        invalid_info = page.evaluate("""() => {
            const ae = document.activeElement; const row = ae && ae.closest('tr');
            return { isInput: !!(ae && ae.classList.contains('inline-code-input')),
                     rowIndex: row ? [...row.parentNode.children].indexOf(row) : -1 };
        }""")
        check("invalid code keeps focus in same row", invalid_info["isInput"] and invalid_info["rowIndex"] == 3, invalid_info)
        page.keyboard.press("Escape")
        db_after = page.evaluate("async () => (await dbGetAll('entries')).length")
        check("invalid code not persisted", db_after == 2, db_after)

        check("zero console errors", len(console_errors) == 0, console_errors)
        browser.close()

    server.shutdown()
    print(f"\nTOTAL: {results['pass']} passed, {results['fail']} failed")
    sys.exit(1 if results["fail"] else 0)

run()
