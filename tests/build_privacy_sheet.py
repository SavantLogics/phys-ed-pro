#!/usr/bin/env python3
"""Builds PhysEdPro_Privacy_Overview.pdf — one-page data privacy &
security sheet for district IT review. Re-run after any edit:
    python3 tests/build_privacy_sheet.py
"""
import os
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                TableStyle, HRFlowable)

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'PhysEdPro_Privacy_Overview.pdf')

ACCENT = HexColor('#c2255c')
DARK = HexColor('#1a1a2e')
GRAY = HexColor('#555555')
LIGHT = HexColor('#f0f2f5')

styles = getSampleStyleSheet()
h1 = ParagraphStyle('h1', parent=styles['Title'], fontSize=17, leading=20,
                    textColor=DARK, alignment=TA_LEFT, spaceAfter=2)
sub = ParagraphStyle('sub', parent=styles['Normal'], fontSize=9.5, leading=12,
                     textColor=GRAY, spaceAfter=6)
h2 = ParagraphStyle('h2', parent=styles['Heading2'], fontSize=10.5, leading=13,
                    textColor=ACCENT, spaceBefore=7, spaceAfter=2)
body = ParagraphStyle('body', parent=styles['Normal'], fontSize=9, leading=11.6)
bullet = ParagraphStyle('bullet', parent=body, leftIndent=10, bulletIndent=2,
                        spaceAfter=1)
cell = ParagraphStyle('cell', parent=body, fontSize=8.5, leading=10.5)
cellb = ParagraphStyle('cellb', parent=cell, fontName='Helvetica-Bold')
foot = ParagraphStyle('foot', parent=styles['Normal'], fontSize=7.5,
                      leading=9.5, textColor=GRAY)

doc = SimpleDocTemplate(OUT, pagesize=letter,
                        leftMargin=0.65 * inch, rightMargin=0.65 * inch,
                        topMargin=0.55 * inch, bottomMargin=0.5 * inch,
                        title='PhysEd Pro — Data Privacy & Security Overview',
                        author='PhysEd Pro')

story = []
story.append(Paragraph('PhysEd Pro — Data Privacy &amp; Security Overview', h1))
story.append(Paragraph('Prepared for district IT review · Version 3.1 · June 2026', sub))
story.append(HRFlowable(width='100%', thickness=1.2, color=ACCENT, spaceAfter=6))

story.append(Paragraph('What it is', h2))
story.append(Paragraph(
    'PhysEd Pro is a single-file, offline web application a PE teacher uses to record class-period '
    'attendance, dress-out, and participation points, and to generate a CSV for the Canvas gradebook. '
    'It replaces a manual grading spreadsheet. It is a local utility in the same category as a '
    'spreadsheet file — <b>not</b> an online service.', body))

story.append(Paragraph('Architecture — no server, no transmission', h2))
for b in [
    'The app is six static files opened in a browser (or installed as a PWA). It functions fully offline.',
    'It makes <b>zero network requests</b> at runtime: no backend server, no accounts or logins, no analytics or '
    'telemetry, no cookies, no third-party scripts, fonts, or CDNs.',
    'All data is stored locally in the browser (IndexedDB) on the teacher’s device. Nothing is ever '
    'transmitted to the developer or to any third party. The developer has no access of any kind to entered data.',
    'Students never use, log into, or interact with the application.',
]:
    story.append(Paragraph(b, bullet, bulletText='•'))

story.append(Paragraph('Data elements stored (entered by the teacher)', h2))
story.append(Paragraph(
    'Student name; student ID / SIS ID (for Canvas matching); class period; daily attendance codes '
    '(e.g., Absent, Tardy, Excused, Non-suit, Non-participation); weekly point totals; brief teacher comments. '
    'No date of birth, contact information, demographic data, health records, or student-created content.', body))

story.append(Paragraph('Data flow', h2))
t = Table([
    [Paragraph('<b>1. Entry</b>', cellb), Paragraph('Teacher records codes on their own device; data persists in browser storage on that device only.', cell)],
    [Paragraph('<b>2. Backup</b>', cellb), Paragraph('Teacher saves a backup file to a location they choose — recommended: a district-managed Google Drive / OneDrive synced folder, so the record copy resides in district storage under existing district security, access control, and retention.', cell)],
    [Paragraph('<b>3. Grades</b>', cellb), Paragraph('A CSV is generated locally and uploaded by the teacher through Canvas’s standard gradebook import. The app has no API connection to Canvas, Google, Microsoft, or any SIS.', cell)],
], colWidths=[0.85 * inch, 6.35 * inch])
t.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (0, -1), LIGHT),
    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ('INNERGRID', (0, 0), (-1, -1), 0.5, HexColor('#cccccc')),
    ('BOX', (0, 0), (-1, -1), 0.5, HexColor('#cccccc')),
    ('TOPPADDING', (0, 0), (-1, -1), 3),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
]))
story.append(t)

story.append(Paragraph('What it does NOT do', h2))
story.append(Paragraph(
    'No data transmission of any kind · no OAuth/API access to district Google, Microsoft, Canvas, or SIS systems · '
    'no student accounts · no advertising · no AI processing · no sale, sharing, or developer collection of any data.', body))

story.append(Paragraph('FERPA posture', h2))
story.append(Paragraph(
    'Attendance and grade data are education records under FERPA. With PhysEd Pro, those records never leave the '
    'teacher’s and district’s control: the tool functions like spreadsheet software, and the developer is not a '
    'recipient of any student data — so there is typically no third-party data disclosure to evaluate and no vendor '
    'data processing agreement applicable (the developer processes nothing). Records remain governed by existing '
    'district policy wherever the teacher stores them, which is why district-managed storage is the documented, '
    'recommended backup location. Reference: U.S. Dept. of Education, studentprivacy.ed.gov. This sheet is '
    'informational, not legal advice; district policy governs.', body))

story.append(Paragraph('Security notes', h2))
story.append(Paragraph(
    'Data at rest is protected by the device’s OS login and disk encryption per district device policy; browser '
    'same-origin isolation applies to local storage. Clearing the browser’s site data removes all locally stored '
    'records. The app is distributable as files for inspection — total codebase is small and human-auditable, and the '
    'absence of network calls is verifiable in the browser’s developer tools (Network tab shows no runtime requests).', body))

story.append(Spacer(1, 8))
story.append(HRFlowable(width='100%', thickness=0.8, color=HexColor('#cccccc'), spaceAfter=4))
story.append(Paragraph(
    'Developer contact: Rodney Hawkins · r.savant.hawkins@gmail.com · Source files available for district review on request.', foot))

doc.build(story)
print('Wrote', os.path.abspath(OUT))
