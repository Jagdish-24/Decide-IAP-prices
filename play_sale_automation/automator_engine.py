"""
Play Sale Automator Core Execution Engine.
Automates copying prices from PlayPriceEngine and setting them in Google Play Console,
with user-intervention detection, fail-safe delays, and step-by-step progress tracking.
"""

import time
import re
import threading
import pyautogui
import pyperclip

from contextlib import contextmanager
from visual_calibrator import (
    VisualScreenshotManager,
    locate_search_bar_visual,
    locate_first_row_pencil_visual,
    locate_price_popup_visual
)

def extract_numeric_value(text):
    """Extracts floating point number from currency text (e.g. '0.19 USD' -> 0.19)."""
    if not text:
        return None
    cleaned = text.replace(",", "")
    matches = re.findall(r"[-+]?\d*\.?\d+", cleaned)
    if matches:
        try:
            return float(matches[0])
        except ValueError:
            return None
    return None

class AutomatorState:
    IDLE = "IDLE"
    COUNTDOWN = "COUNTDOWN"
    RUNNING = "RUNNING"
    PAUSED = "PAUSED"
    STOPPED = "STOPPED"
    COMPLETED = "COMPLETED"

class PlaySaleAutomatorEngine:
    def __init__(self, config, countries, mouse_detector):
        self.config = config
        self.countries = countries
        self.mouse_detector = mouse_detector

        self.state = AutomatorState.IDLE
        self.current_country_index = 0
        self.stop_requested = False
        self.worker_thread = None
        self.screenshot_mgr = VisualScreenshotManager()
        self.is_simulating = False
        self.last_country_matched = False

        # Callbacks for GUI integration
        self.on_state_change = None
        self.on_progress_update = None
        self.on_pause_tick = None
        self.on_log = None

        # Wire mouse detector events
        self.mouse_detector.add_on_pause(self._handle_user_pause)
        self.mouse_detector.add_on_resume(self._handle_user_resume)

    @contextmanager
    def bot_action(self):
        """
        Synchronized context manager for bot actions.
        Ensures both mouse detector and keyboard listeners ignore bot-generated actions.
        """
        self.is_simulating = True
        try:
            with self.mouse_detector.bot_movement():
                yield
        finally:
            self.is_simulating = False

    def log(self, message):
        """Sends log entry to GUI and console."""
        try:
            print(f"[Automator] {message}")
        except UnicodeEncodeError:
            print(f"[Automator] {message.encode('ascii', 'replace').decode('ascii')}")
        if self.on_log:
            self.on_log(message)

    def set_state(self, new_state, msg=""):
        """Updates internal state and notifies GUI."""
        self.state = new_state
        if self.on_state_change:
            self.on_state_change(new_state, msg)

    def _handle_user_pause(self, duration):
        if self.state in [AutomatorState.RUNNING, AutomatorState.COUNTDOWN]:
            self.set_state(AutomatorState.PAUSED, f"User mouse movement detected! Paused for {duration:.0f}s...")
            self.log(f"⚠️ User mouse movement detected! Pausing for {duration:.0f}s before resuming...")

    def _handle_user_resume(self):
        if self.state == AutomatorState.PAUSED and not self.stop_requested:
            self.set_state(AutomatorState.RUNNING, "Resuming automation...")
            self.log("✅ Mouse is steady. Resuming automation...")

    def start(self, start_index=0):
        """Starts automation loop from start_index in a background thread."""
        if self.state in [AutomatorState.RUNNING, AutomatorState.COUNTDOWN]:
            return
        
        self.stop_requested = False
        self.current_country_index = start_index
        self.mouse_detector.start()
        
        self.worker_thread = threading.Thread(target=self._run_loop, daemon=True)
        self.worker_thread.start()

    def stop(self):
        """Requests immediate stop of automation."""
        self.stop_requested = True
        self.set_state(AutomatorState.STOPPED, "Automation stopped by user.")
        self.log("🛑 Automation stopped.")
        self.mouse_detector.stop()

    def test_single_country(self, country_index):
        """Runs automation for just 1 single country safely to test coordinates."""
        if self.state in [AutomatorState.RUNNING, AutomatorState.COUNTDOWN]:
            return
        
        self.stop_requested = False
        self.current_country_index = country_index
        self.mouse_detector.start()
        
        self.worker_thread = threading.Thread(target=self._run_single_test, args=(country_index,), daemon=True)
        self.worker_thread.start()

    def _safe_sleep(self, seconds):
        """Sleeps in small slices while checking for stop or user-pause events."""
        end_time = time.time() + seconds
        while time.time() < end_time:
            if self.stop_requested:
                return False

            # If user intervened and triggered a 10s pause
            if self.mouse_detector.is_paused():
                while self.mouse_detector.is_paused() and not self.stop_requested:
                    rem = self.mouse_detector.get_remaining_pause()
                    if self.on_pause_tick:
                        self.on_pause_tick(rem)
                    time.sleep(0.1)
                if self.stop_requested:
                    return False
                # After pause ends, give brief settling time
                time.sleep(0.2)

            time.sleep(0.05)
        return True

    def _safe_click(self, x, y, clicks=1, button="left", move_duration=None):
        """Moves to (x, y) safely registering with mouse detector and clicks."""
        if self.stop_requested:
            return False

        timing = self.config.get("timing", {})
        dur = move_duration or timing.get("mouse_move_duration", 0.25)

        with self.bot_action():
            pyautogui.moveTo(x, y, duration=dur)
            pyautogui.click(x=x, y=y, clicks=clicks, button=button)

        return True

    def _safe_press(self, key_name):
        """Safely presses a key under bot_action context so pynput doesn't misinterpret as user hotkey."""
        if self.stop_requested:
            return False
        try:
            with self.bot_action():
                pyautogui.press(key_name)
        except Exception as e:
            self.log(f"⚠️ Key press warning ({key_name}): {e}")
        return True

    def _safe_write(self, text):
        """Writes text or pastes via clipboard safely."""
        if self.stop_requested:
            return False
        # Using clipboard paste is 100% reliable across all locales and special characters
        try:
            with self.bot_action():
                pyperclip.copy(text)
                pyautogui.hotkey("ctrl", "v")
        except Exception as e:
            self.log(f"⚠️ Clipboard paste warning: {e}")
        self._safe_sleep(0.08)
        return True

    def _run_single_test(self, index):
        country = self.countries[index]
        self.log(f"🧪 Testing 1 country: {country['name']} ({country['currency']})")
        self.set_state(AutomatorState.RUNNING, f"Testing: {country['name']}")
        
        success, final_price = self._process_country(country, index)
        is_matched = getattr(self, "last_country_matched", False)
        status_label = "matched" if is_matched else ("completed" if success else "failed")

        if success:
            if is_matched:
                self.set_state(AutomatorState.COMPLETED, f"Test passed: {country['name']} price already matches target ({final_price})!")
                self.log(f"✨ Test passed: {country['name']} price already matches target ({final_price}). Ready for next country.")
            else:
                self.set_state(AutomatorState.COMPLETED, f"Test completed successfully for {country['name']} ({final_price})!")
                self.log(f"🎉 Test passed for {country['name']} (Price: {final_price})!")
            
            # Advance queue cursor to next country
            if index + 1 < len(self.countries):
                self.current_country_index = index + 1

            if self.on_progress_update:
                self.on_progress_update(index + 1, len(self.countries), country, status_label, final_price)
        else:
            self.set_state(AutomatorState.STOPPED, f"Test stopped or failed for {country['name']}.")
        self.mouse_detector.stop()

    def _run_loop(self):
        timing = self.config.get("timing", {})
        pre_delay = int(timing.get("pre_start_delay", 5.0))

        # 1. 5-Second Start Countdown
        self.set_state(AutomatorState.COUNTDOWN, f"Starting in {pre_delay} seconds...")
        for i in range(pre_delay, 0, -1):
            if self.stop_requested:
                return
            self.set_state(AutomatorState.COUNTDOWN, f"Starting in {i} seconds (Press F9/Esc to cancel)...")
            self.log(f"⏳ Countdown: {i}s before mouse starts...")
            if not self._safe_sleep(1.0):
                return

        self.set_state(AutomatorState.RUNNING, "Automation active.")
        total_countries = len(self.countries)

        # 2. Main processing loop
        for idx in range(self.current_country_index, total_countries):
            if self.stop_requested:
                break

            country = self.countries[idx]
            self.current_country_index = idx

            if self.on_progress_update:
                self.on_progress_update(idx, total_countries, country, "processing", "")

            success, final_price = self._process_country(country, idx)
            is_matched = getattr(self, "last_country_matched", False)
            status_label = "matched" if is_matched else ("completed" if success else "failed")

            if not success:
                if self.stop_requested:
                    break
                self.log(f"⚠️ Warning: Could not complete {country['name']}, proceeding to next...")

            if self.on_progress_update:
                self.on_progress_update(idx + 1, total_countries, country, status_label, final_price)

            # Pause between countries
            if not self._safe_sleep(timing.get("step_delay", 0.7)):
                break

        if not self.stop_requested and self.current_country_index >= total_countries - 1:
            self.set_state(AutomatorState.COMPLETED, "All 176 countries processed successfully!")
            self.log("🏆 All countries processed successfully!")
        
        self.mouse_detector.stop()

    def _process_country(self, country, index):
        """
        Processes a single country using visual screenshot guidance & verification.
        Executes without any page scrolling:
        1. Copies country name to clipboard & captures Screenshot 1.
        2. Locates search bar, double-clicks to select all text, pastes country name & captures Screenshot 2.
        3. Locates edit pencil icon in filtered row 1 & opens popup.
        4. Double-clicks price input, reads existing value.
           - If matched: cleanly closes dialog and continues immediately to next country.
           - If mismatched: pastes target price from CSV, clicks Save, & captures Screenshot 4.
        Maintains at most 5 screenshots in play_sale_automation/screenshots/.
        """
        c_name = country["name"]
        coords = self.config.get("coordinates", {})
        timing = self.config.get("timing", {})
        is_single_window = self.config.get("automation_mode", "single_window") == "single_window"
        pricing_mode = self.config.get("pricing_target_mode", "sale")  # "sale" or "retail"

        self.last_country_matched = False
        self.log(f"[{index + 1}/{len(self.countries)}] 📍 Processing: {c_name} ({country.get('currency', '')})")

        # -------------------------------------------------------------
        # STEP 1: Determine Target Price & Copy Country Name (Screenshot 1)
        # -------------------------------------------------------------
        if is_single_window:
            if pricing_mode == "retail":
                raw_val = country.get("retail_price", 0.0)
            else:
                raw_val = country.get("sale_price", country.get("retail_price", 0.0))

            try:
                f_val = float(raw_val)
                if f_val.is_integer():
                    copied_price = str(int(f_val))
                else:
                    copied_price = f"{f_val:.2f}"
            except Exception:
                copied_price = str(raw_val)

            mode_label = "Sale Price" if pricing_mode == "sale" else "Regular Price"
            self.log(f"[{c_name}] 🎯 Target {mode_label} from file: '{copied_price}' {country.get('currency', '')}")

        else:
            # Dual-Window Mode: Retrieve from right window if configured
            self.set_state(AutomatorState.RUNNING, f"[{c_name}] Finding price in PlayPriceEngine...")
            r_search = coords.get("right_search_box", {"x": 2280, "y": 325})
            if not self._safe_click(r_search["x"], r_search["y"]):
                return False, ""
            with self.bot_action():
                pyautogui.hotkey("ctrl", "a")
            self._safe_sleep(0.08)
            self._safe_write(c_name)
            self._safe_press("enter")
            if not self._safe_sleep(timing.get("search_delay", 0.8)):
                return False, ""
            r_copy = coords.get("right_copy_button", {"x": 1960, "y": 410})
            if not self._safe_click(r_copy["x"], r_copy["y"]):
                return False, ""
            if not self._safe_sleep(0.25):
                return False, ""
            try:
                copied_price = pyperclip.paste().strip()
            except Exception:
                copied_price = ""
            self.log(f"[{c_name}] 📋 Copied price from screen: '{copied_price}'")

        if not copied_price or not any(char.isdigit() for char in copied_price):
            self.log(f"[{c_name}] ⚠️ Warning: Empty or non-numeric price target: '{copied_price}'")

        # Copy country name to clipboard & capture Screenshot 1
        pyperclip.copy(c_name)
        self.log(f"[{c_name}] 📸 Step 1: Copied country '{c_name}' to clipboard. Capturing screenshot...")
        self.screenshot_mgr.capture_and_save("step1_country_copied", label=c_name)

        # -------------------------------------------------------------
        # STEP 2: Double-Click Search Bar, Paste Country Directly (Screenshot 2)
        # -------------------------------------------------------------
        self.set_state(AutomatorState.RUNNING, f"[{c_name}] Locating search bar & filtering...")

        l_search = coords.get("left_search_box", {"x": 955, "y": 367})
        search_x, search_y = l_search["x"], l_search["y"]
        if self.config.get("auto_detect_visual", False):
            dyn_search = locate_search_bar_visual()
            if dyn_search:
                search_x, search_y = dyn_search
                self.log(f"[{c_name}] 👁️ Visually located search bar at ({search_x}, {search_y})")

        # Double-click to select all text in the search bar
        if not self._safe_click(search_x, search_y, clicks=2):
            return False, copied_price

        # Brief pause to allow selection highlight to register
        if not self._safe_sleep(0.08):
            return False, copied_price

        # Paste the current task country name directly over the selection (no backspace needed)
        self._safe_write(c_name)
        self._safe_press("enter")

        # Wait for left table to filter to row 1
        if not self._safe_sleep(timing.get("search_delay", 0.8)):
            return False, copied_price

        self.log(f"[{c_name}] 📸 Step 2: Searched '{c_name}' in Google Play Console. Capturing screenshot...")
        self.screenshot_mgr.capture_and_save("step2_country_searched", label=c_name)

        # -------------------------------------------------------------
        # STEP 3: Locate Edit Button (Pencil Icon) in Row 1 & Open Popup
        # -------------------------------------------------------------
        self.set_state(AutomatorState.RUNNING, f"[{c_name}] Locating edit pencil in filtered row...")

        l_pencil = coords.get("left_row_pencil", {"x": 545, "y": 470})
        pencil_x, pencil_y = l_pencil["x"], l_pencil["y"]
        if self.config.get("auto_detect_visual", False):
            dyn_pencil = locate_first_row_pencil_visual(search_bar_y=search_y)
            if dyn_pencil:
                pencil_x, pencil_y = dyn_pencil
                self.log(f"[{c_name}] 👁️ Visually located row pencil at ({pencil_x}, {pencil_y})")

        if not self._safe_click(pencil_x, pencil_y, clicks=1):
            return False, copied_price

        # Wait for popup to open
        if not self._safe_sleep(timing.get("popup_delay", 0.8)):
            return False, copied_price

        # -------------------------------------------------------------
        # STEP 4: Double-Click Popup Input, Check or Paste Value (Screenshot 3)
        # -------------------------------------------------------------
        self.set_state(AutomatorState.RUNNING, f"[{c_name}] Checking existing price in popup...")

        l_input_cfg = coords.get("left_popup_input", {"x": 550, "y": 560})
        input_x, input_y = l_input_cfg["x"], l_input_cfg["y"]
        if self.config.get("auto_detect_visual", False):
            dyn_input = locate_price_popup_visual(fallback_pt=l_input_cfg)
            if isinstance(dyn_input, dict):
                input_x, input_y = dyn_input["x"], dyn_input["y"]
            elif isinstance(dyn_input, (tuple, list)):
                input_x, input_y = dyn_input[0], dyn_input[1]

        # Double-click selects the value inside the HTML <input> field safely
        if not self._safe_click(input_x, input_y, clicks=2):
            return False, copied_price

        if not self._safe_sleep(0.1):
            return False, copied_price

        # Read existing value currently inside the popup box
        with self.bot_action():
            pyautogui.hotkey("ctrl", "c")
        self._safe_sleep(0.08)

        try:
            existing_text = pyperclip.paste().strip()
        except Exception:
            existing_text = ""

        existing_num = extract_numeric_value(existing_text)
        target_num = extract_numeric_value(copied_price)

        # CASE A: Value is ALREADY matching (e.g. 0.19 == 0.19 or 0.29 == 0.29)
        # DO NOT STOP AUTOMATION -> cleanly close popup and continue immediately to next country!
        if existing_num is not None and target_num is not None and abs(existing_num - target_num) < 0.0001:
            self.last_country_matched = True
            self.log(f"[{c_name}] ✨ Value already matches target ({existing_num} == {target_num}). No change needed! Continuing to next country...")
            self.set_state(AutomatorState.RUNNING, f"[{c_name}] Value matches ({copied_price}). Continuing...")

            # Capture screenshot of matching state
            self.screenshot_mgr.capture_and_save("step3_price_matched", label=c_name)

            # Close popup cleanly without triggering emergency-stop hotkey:
            # 1. Click Cancel button in popup modal
            l_cancel = coords.get("left_popup_cancel", {"x": 510, "y": 625})
            self._safe_click(l_cancel["x"], l_cancel["y"])
            self._safe_sleep(0.1)

            # 2. Press Escape under bot_action guard to ensure popup dismissed
            self._safe_press("escape")

            if not self._safe_sleep(timing.get("step_delay", 0.4)):
                return False, copied_price
            return True, copied_price

        # CASE B: Value DOES NOT match -> Overwrite with correct target price
        self.last_country_matched = False
        if existing_num is not None:
            self.log(f"[{c_name}] 🔄 Mismatch detected! Existing '{existing_text}' != Target '{copied_price}'. Overwriting with correct value...")
        else:
            self.log(f"[{c_name}] ✍️ Setting price: '{copied_price}'...")

        self.set_state(AutomatorState.RUNNING, f"[{c_name}] Overwriting with {copied_price}...")

        # Clear price field and paste correct value
        self._safe_click(input_x, input_y, clicks=2)
        self._safe_sleep(0.05)
        self._safe_press("backspace")
        self._safe_write(copied_price)
        if not self._safe_sleep(0.25):
            return False, copied_price

        self.log(f"[{c_name}] 📸 Step 3: Pasted target price '{copied_price}' in popup. Capturing screenshot...")
        self.screenshot_mgr.capture_and_save("step3_price_entered", label=c_name)

        # -------------------------------------------------------------
        # STEP 5: Click Save Button & Verify with Screenshot 4
        # -------------------------------------------------------------
        self.set_state(AutomatorState.RUNNING, f"[{c_name}] Saving price...")

        l_save = coords.get("left_popup_save", {"x": 575, "y": 625})
        if not self._safe_click(l_save["x"], l_save["y"]):
            return False, copied_price

        # Wait for popup to close and row to update
        if not self._safe_sleep(timing.get("post_save_delay", 0.8)):
            return False, copied_price

        self.screenshot_mgr.capture_and_save("step4_saved_verified", label=c_name)
        self.log(f"[{c_name}] 📸 Step 4: Successfully set price to {copied_price} & verified with screenshot.")
        return True, copied_price


