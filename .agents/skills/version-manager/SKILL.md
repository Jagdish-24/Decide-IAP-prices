---
name: version-manager
description: >-
  Enforce semantic versioning (Major.Minor.Micro / X.Y.Z) and Last Updated date maintenance across the PlayPrice Engine website and the desktop Play Sale Automator program. Always trigger after each new improvement, addition, or fix.
---

# Semantic Versioning & Release Tracking Skill

This skill enforces strict Semantic Versioning (`X.Y.Z` -> `MAJOR.MINOR.MICRO`) and synchronized "Last Updated" date tracking across both the **PlayPrice Engine web application** and the **Play Sale Automator desktop program**.

---

## 1. When to Trigger This Skill

Execute this skill **every time** any of the following occur:
- A new feature or capability is introduced (e.g. new export formats, new bot modes, new simulation controls).
- A UI or UX enhancement is made (e.g. layout redesigns, responsive improvements, visual polish).
- A bug fix or calibration update is committed (e.g. calculation adjustments, parser fixes, screen coordinate tweaks).
- A performance optimization or refactor is completed.

---

## 2. Version Number Scheme: `MAJOR.MINOR.MICRO` (`X.Y.Z`)

| Bump Level | Format | When to Increment | Examples |
| :--- | :--- | :--- | :--- |
| **MAJOR** | `X.0.0` | Breaking architectural redesigns, fundamental schema overhauls, or complete platform rewrites. Resets Minor and Micro to 0. | `1.0.0` $\rightarrow$ `2.0.0` |
| **MINOR** | `X.Y.0` | Significant new features, new export engines, major UI redesigns, or new automation modes. Resets Micro to 0. | `1.2.0` $\rightarrow$ `1.3.0` |
| **MICRO** (Patch) | `X.Y.Z` | Bug fixes, UI/UX polish, styling tweaks, minor layout adjustments, or coordinate calibrations. Increments Z. | `1.2.0` $\rightarrow$ `1.2.1` |

---

## 3. Synchronized File Locations

Whenever bumping the version and updating the date, update all of the following locations in unison:

### A. Web Application (`PlayPrice Engine`)
1. **[`app.js`](file:///j:/git/git_projects/Decide%20IAP%20price/app.js)**:
   ```javascript
   const APP_VERSION = '1.2.0';
   const APP_LAST_UPDATED = '24 Oct 2026';
   ```
2. **[`index.html`](file:///j:/git/git_projects/Decide%20IAP%20price/index.html)**:
   - Header badge `#headerVersionPill`:
     - `#appVersionText`: `v1.2.0`
     - `#lastUpdatedDateText`: `Updated 24 Oct 2026`
   - Changelog modal `#versionModal`: Add the new version bullet points to the release history list.

### B. Desktop Program (`Play Sale Automator`)
1. **[`python_software_automation/config.py`](file:///j:/git/git_projects/Decide%20IAP%20price/python_software_automation/config.py)**:
   ```python
   APP_VERSION = "1.2.0"
   APP_LAST_UPDATED = "24 Oct 2026"
   ```
2. **[`python_software_automation/gui.py`](file:///j:/git/git_projects/Decide%20IAP%20price/python_software_automation/gui.py)**:
   - Header version badge: `v1.2.0 • Updated 24 Oct 2026`
   - Footer status bar: `v1.2.0 (Updated 24 Oct 2026) • Fail-safe Mouse Pause Active`

---

## 4. Execution Checklist

When completing any change:
- [ ] Determine bump level: **Major**, **Minor**, or **Micro**.
- [ ] Get current local date in standard format (e.g. `24 Oct 2026`).
- [ ] Update `APP_VERSION` and `APP_LAST_UPDATED` in `app.js`.
- [ ] Update `index.html` header pill elements and append changelog entry in `#versionModal`.
- [ ] Update `APP_VERSION` and `APP_LAST_UPDATED` in `python_software_automation/config.py`.
- [ ] Verify both the website and desktop GUI display the identical version and last updated date.
