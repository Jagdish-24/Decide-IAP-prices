# Versioning & Release Tracking Rule

Whenever any new improvement, feature, UI polish, bug fix, or adjustment is made to either the **PlayPrice Engine** website or the **Play Sale Automator** desktop program:
1. Always update the version number in `X.X.X` format following Semantic Versioning (`MAJOR.MINOR.MICRO`).
   - `MAJOR` (`X.0.0`): Architectural overhauls or breaking redesigns.
   - `MINOR` (`X.Y.0`): New functional capabilities, new export buttons, automation modes, or substantial UI redesigns.
   - `MICRO` (`X.Y.Z`): Bug fixes, UI/UX polish, styling enhancements, or coordinate calibrations.
2. Always update the "Last Updated" date across:
   - `app.js` (`APP_VERSION`, `APP_LAST_UPDATED`)
   - `index.html` (header badge `#appVersionText`, `#lastUpdatedDateText`, and `#versionModal`)
   - `play_sale_automation/config.py` (`APP_VERSION`, `APP_LAST_UPDATED`)
   - `play_sale_automation/gui.py` (header badge and footer version string)
3. Ensure the version and last updated date displayed in the website header and desktop program remain identical.
