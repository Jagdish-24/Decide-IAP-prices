# 🤖 Google Play Console Price Automator

A streamlined automation robot for Google Play Console pricing. 

It supports **Single-Window Mode (Play Console Only • File-Fed)** as well as **Dual-Window Mode (Screen Copy)**.

---

## 🎯 Supported Task Modes (3-Option Dropdown)

1. **1. Set Retail Price**
   - Automates regular base app / IAP prices in Google Play Console.
   - Searches country by name in the *"Search by country or region"* box.
   - Clicks the edit pencil in the *"Price"* column and inputs the target retail price.
2. **2. Set Discounted Retail Price**
   - Automates promotional discounted prices in Google Play Console.
   - Searches country by name in the *"Search by country or region"* box.
   - Clicks the edit pencil in the *"Sale price"* column and inputs the discounted price.
3. **3. Set Discount Percentage**
   - Automates promotional discount percentages in Google Play Console.
   - Searches country by name in the *"Search by country or region"* box.
   - Clicks the edit pencil in the *"Sale price"* column and inputs the percentage value (e.g. 50%).

---

## ⚡ 1-Window Mode (Recommended • Fastest & 100% Reliable)

Instead of the bot having to physically switch back and forth between two browser windows:
1. Export a **CSV or JSON file** from PlayPriceEngine (or use the pre-loaded [`default_pricing_matrix.csv`](default_pricing_matrix.csv)).
2. Click **📁 Load File (CSV/JSON)** in the tool.
3. Select your task mode from the dropdown (**1. Set Retail Price**, **2. Set Discounted Retail Price**, or **3. Set Discount Percentage**). The mode auto-detects from filename!
4. The tool reads all 176 prices directly from memory and **only operates on the Google Play Console window**.
5. **Benefits:** 3x faster (~2 seconds per country), zero window focus conflicts, and immune to screen misclicks!

---

## 🖥️ Screen Setup

- **For 1-Window Mode (Default):**
  - Open **Google Play Console** (`https://play.google.com/console/`) on screen (left half or full screen).
  - Open the Automator tool GUI.
- **For 2-Window Mode:**
  - Left Window: Google Play Console (`Win + Left Arrow`).
  - Right Window: PlayPriceEngine website (`Win + Right Arrow`).

---

## 🚀 How to Run

Double click [`launch_sale_automator.bat`](file:///j:/git/git_projects/Decide%20IAP%20price/launch_sale_automator.bat) in the project root, or execute:
```bash
python python_software_automation\run_sale_bot.py
```

---

## 🛡️ Fail-Safes & Controls

- **5-Second Start Delay:** Gives you time to focus your browser window before the mouse begins moving.
- **10-Second Mouse Movement Pause:** If you physically move your mouse, the bot immediately halts and pauses for 10 seconds.
- **Smart Price Comparison:** If the price inside the popup already matches the target price, the bot closes the popup cleanly with `Escape` to avoid getting trapped by Google Play's disabled/greyed-out Save button. If it doesn't match, it completely overwrites and saves.
- **Global Hotkeys:**
  - **`F8`**: Start / Resume automation.
  - **`F9` or `Esc`**: Emergency Stop.

---

## 📂 File Structure

```
python_software_automation/
├── automator_engine.py          # Core transfer loop & automation worker
├── config.py                    # Coordinate calibration & persistence
├── countries_data.json          # Roster of all 176 Google Play countries
├── default_pricing_matrix.csv   # Pre-calculated EUR 0.99 50% promo matrix
├── file_parser.py               # CSV and JSON pricing file parser
├── gui.py                       # Modern dark-mode Tkinter GUI
├── mouse_detector.py            # Background thread tracking user mouse movement
├── run_sale_bot.py              # Entry point launcher
├── window_locator.py            # Screen detection & coordinate picker
└── cache/                       # User coordinates & settings (git-ignored)
```
