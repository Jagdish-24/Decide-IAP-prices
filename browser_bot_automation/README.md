# PlayPrice Automator for Google Play Console (In-Browser DOM Robot)

> **Zero Mouse Hijacking • 100% DOM-Native Precision • Universal Screen Compatibility**

The **PlayPrice In-Browser Automator** is a lightweight, zero-dependency in-browser robot designed specifically for Google Play Console's *Edit sale* and *Availability and pricing* pages. It reads your exported `bot_sale_prices_*.csv` file directly and automates price setting for all 176 countries in ~60 seconds via native web DOM events.

---

## 🚀 Choose Your Preferred Installation Method

### Method 1: 1-Click Bookmarklet (Easiest — No Extension Needed)
1. Double click and open [`browser_bot_automation/install_guide.html`](install_guide.html) in Google Chrome.
2. Drag the glowing **⚡ PlayPrice Automator** button directly onto your Chrome **Bookmarks Bar** (press `Ctrl + Shift + B` if your bookmarks bar is hidden).
3. Open any Google Play Console **Edit sale** page.
4. Click the bookmark! The floating robot panel will instantly appear in the top-right corner.

---

### Method 2: Standalone Chrome Extension
1. Open `chrome://extensions` in Google Chrome.
2. Toggle on **Developer mode** in the top-right corner.
3. Click **Load unpacked** (top-left).
4. Select the [`browser_bot_automation/chrome_extension`](chrome_extension) folder.
5. Done! The robot will automatically activate whenever you visit Google Play Console.

---

### Method 3: Tampermonkey / Violentmonkey Userscript
1. If you use Tampermonkey or Violentmonkey, install [`play_price_automator.user.js`](play_price_automator.user.js).
2. It will automatically inject on `https://play.google.com/console/*`.

---

## 📖 Step-by-Step Usage Instructions

1. **Export from PlayPrice Engine:**
   - In the PlayPrice Engine web app, click **`Bot CSV (Sale Prices)`** (or `Bot CSV (App Prices)`).
   - This exports a CSV containing all 176 countries with their formatted target prices.

2. **Open Google Play Console:**
   - Navigate to your app in Google Play Console.
   - Go to **Grow** -> **Store presence** -> **Pricing & sales** (or your active sale page).
   - Click **Edit sale** to view the country pricing table.

3. **Launch or Show the Robot:**
   - Click the extension icon, use the **`⚡ Show / Hide Automator Panel`** button, or press **`Alt + P`** anywhere on the Play Console page.
   - When hidden, the window is completely removed from view (zero clutter). When shown, the full command center appears instantly.

4. **Select Mode & Load CSV:**
   - Choose your target mode from the 3-option dropdown:
     - **`1. Set Retail Price`**: Targets the Play Console **"Price"** column using the `Retail Price` column from CSV.
     - **`2. Set Discounted Retail Price`**: Targets the Play Console **"Sale price"** column using the `Discounted Price` column from CSV.
     - **`3. Set Discount Percentage`**: Targets the Play Console **"Sale price"** column using the `Discount Percentage` column from CSV.
   - Drag and drop your downloaded automation CSV file into the panel.
   - You will see: `176 Countries Loaded`.
   - Click **`▶ Start`**!

5. **Universal Precision Workflow:**
   1. Filters the country in Google Play Console's search bar by country name.
   2. Identifies the filtered country row.
   3. Based on the selected dropdown mode, locates the edit pencil icon specifically inside the target column (**"Price"** for Retail Price, **"Sale price"** for Discounted Price / Discount Percentage).
   4. Opens the edit dialog, compares the existing value with the target value.
   5. If already matching, cleanly closes the dialog and skips saving to prevent unnecessary API calls. If mismatched, enters the target value and clicks **"Save"**.
   6. **Mouse Free:** Your mouse remains completely free to browse or use other applications.

6. **Save Changes:**
   - When finished, review the summary.
   - If **Auto-Save Console** is checked, the robot automatically clicks Google Play Console's bottom **Save changes** bar.

---

## 🛡️ Key Features & Edge-Case Protection

- **Two-Tier Mode Hierarchy:** Seamlessly switch between **App Price** (base retail pricing on the *Pricing* tab) and **App Sale Price** (promotional sales with sub-modes for *Fixed Price* and *Discount %* on the *Sales* tab).

- **Dual Real-time Timers:** Active stopwatch tracking execution duration and adaptive estimated time remaining with projected clock completion time (`ETA: HH:MM`).
- **Safe Cadence & Anti-Bot Shield:**
  - *Safe & Steady (1600ms) [Default]:* Ideal human-like pacing for reliable processing.
  - *Ultra-Safe (2500ms):* Maximum protection against rate-limits on sensitive accounts.
  - *Moderate (1000ms):* Balanced speed for tested setups.
  - *Maximum Caution (3500ms):* Slow and steady for turbulent network environments.
  - *Natural Jitter & Task Micro-Pauses Across ALL Options:* Every speed option automatically applies proportional natural human jitter (±15% to 25%) plus randomized human micro-delays between every sub-task (typing search, finding rows, opening popups, inspecting prices, entering numbers, and saving), alongside a natural ~3s breathing rest break every 25 rows to look authentically human.
- **Clean Zero-Clutter Show/Hide:** Toggle the full automator window with **`Alt + P`** or the extension popup button. When hidden, it leaves your Play Console view 100% clean and unobstructed with zero floating pills or icons.
- **Native Event Dispatching:** Dispatches `input`, `change`, and `Enter` keyboard events directly to Google's Angular/Material input elements.
- **Smart Duplicate Protection:** Checks existing values first; skips already-configured countries to save time and prevent unnecessary network calls.
- **Pause & Resume:** Easily pause, resume, or stop execution at any time.


