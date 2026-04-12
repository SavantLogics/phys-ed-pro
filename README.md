# PhysEd Pro

Offline-first PE attendance and participation tracker for physical education teachers.

## Features
- Track attendance across up to 6 class periods
- Weekly grid view (2-week span) with color-coded attendance codes
- Automatic point deduction calculations
- Works offline as a PWA (installable on phone/tablet)
- All data stored locally in localStorage

## Usage
Open `index.html` in any modern browser. No server required.

## Attendance Codes
| Code | Meaning | Default Deduction |
|------|---------|-------------------|
| A | Absent | -10 pts |
| N | Non-suit | -5 pts |
| P | Non-participation | -5 pts |
| NP | Non-suit + Non-participation | -10 pts |
| TN | Tardy + Non-suit | -5 pts |
| TP | Tardy + Non-participation | -5 pts |
| TNP | Tardy + Non-suit + Non-participation | -10 pts |
| EX | Excused | 0 pts |
| MED | Medically Excused | 0 pts |
| T | Tardy | 0 pts |

Point deductions are configurable in the Settings tab.
