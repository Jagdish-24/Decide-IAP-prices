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

        # Callbacks for GUI integration
        self.on_state_change = None
        self.on_progress_update = None
        self.on_pause_tick = None
        self.on_log = None

        # Wire mouse detector events
        self.mouse_detector.add_on_pause(self._handle_user_pause)
        self.mouse_detector.add_on_resume(self._handle_user_resume)

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

        # Notify detector that bot is moving cursor to target
        self.mouse_detector.register_bot_action((x, y))
        pyautogui.moveTo(x, y, duration=dur)

        if not self._safe_sleep(0.08):
            return False

        self.mouse_detector.register_bot_action((x, y))
        pyautogui.click(x=x, y=y, clicks=clicks, button=button)
        return True

    def _safe_write(self, text):
        """Writes text or pastes via clipboard safely."""
        if self.stop_requested:
            return False
        # Using clipboard paste is 100% reliable across all locales and special characters
        try:
            pyperclip.copy(text)
            pyautogui.hotkey("ctrl", "v")
        except Exception as e:
            self.log(f"⚠️ Clipboard paste warning: {e}")
        self._safe_sleep(0.1)

    def _run_single_test(self, index):
        country = self.countries[index]
        self.log(f"🧪 Testing 1 country: {country['name']} ({country['currency']})")
        self.set_state(AutomatorState.RUNNING, f"Testing: {country['name']}")
        
        success, final_price = self._process_country(country, index)
        if success:
            self.set_state(AutomatorState.COMPLETED, f"Test completed successfully for {country['name']} ({final_price})!")
            self.log(f"🎉 Test passed for {country['name']} (Price: {final_price})!")
            if self.on_progress_update:
                self.on_progress_update(index + 1, len(self.countries), country, "completed", final_price)
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
            if not success:
                if self.stop_requested:
                    break
                self.log(f"⚠️ Warning: Could not complete {country['name']}, proceeding to next...")

            if self.on_progress_update:
                self.on_progress_update(idx + 1, total_countries, country, "completed" if success else "failed", final_price)

            # Pause between countries
            if not self._safe_sleep(timing.get("step_delay", 0.7)):
                break

        if not self.stop_requested and self.current_country_index >= total_countries - 1:
            self.set_state(AutomatorState.COMPLETED, "All 176 countries processed successfully!")
            self.log("🏆 All countries processed successfully!")
        
        self.mouse_detector.stop()

    def _process_country(self, country, index):
        """Processes a single country. Supports Single-Window (File/Memory) or Dual-Window mode."""
        c_name = country["name"]
        coords = self.config.get("coordinates", {})
        timing = self.config.get("timing", {})
        is_single_window = self.config.get("automation_mode", "single_window") == "single_window"
        pricing_mode = self.config.get("pricing_target_mode", "sale")  # "sale" or "retail"

        self.log(f"[{index + 1}/{len(self.countries)}] 📍 Processing: {c_name} ({country.get('currency', '')})")

        # -------------------------------------------------------------
        # STEP 1: Determine Target Price
        # -------------------------------------------------------------
        if is_single_window:
            # Single-Window Mode: Retrieve price directly from file/memory (No right window needed!)
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
            # Dual-Window Mode: Physically search and copy from right window
            self.set_state(AutomatorState.RUNNING, f"[{c_name}] Finding price in PlayPriceEngine...")
            
            r_search = coords.get("right_search_box", {"x": 2280, "y": 325})
            if not self._safe_click(r_search["x"], r_search["y"]):
                return False, ""
            
            pyautogui.hotkey("ctrl", "a")
            self._safe_sleep(0.08)
            self._safe_write(c_name)
            pyautogui.press("enter")
            
            if not self._safe_sleep(timing.get("search_delay", 1.0)):
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

        # -------------------------------------------------------------
        # STEP 2: Search Country in Left Window (Google Play Console)
        # -------------------------------------------------------------
        self.set_state(AutomatorState.RUNNING, f"[{c_name}] Searching in Google Play Console...")

        l_search = coords.get("left_search_box", {"x": 896, "y": 965})
        if not self._safe_click(l_search["x"], l_search["y"]):
            return False, copied_price

        pyautogui.hotkey("ctrl", "a")
        self._safe_sleep(0.08)
        self._safe_write(c_name)
        pyautogui.press("enter")

        # Wait for left table to filter
        if not self._safe_sleep(timing.get("search_delay", 1.0)):
            return False, copied_price

        # -------------------------------------------------------------
        # STEP 3: Click Pencil Icon to Open Edit Price Popup
        # -------------------------------------------------------------
        self.set_state(AutomatorState.RUNNING, f"[{c_name}] Opening Edit Price popup...")

        l_pencil = coords.get("left_row_pencil", {"x": 525, "y": 1065})
        if not self._safe_click(l_pencil["x"], l_pencil["y"]):
            return False, copied_price

        # Wait for popup to open
        if not self._safe_sleep(timing.get("popup_delay", 0.8)):
            return False, copied_price

        # -------------------------------------------------------------
        # STEP 4: Inspect Existing Price in Popup vs Target Price
        # -------------------------------------------------------------
        self.set_state(AutomatorState.RUNNING, f"[{c_name}] Checking existing price in popup...")

        l_input = coords.get("left_popup_input", {"x": 600, "y": 1150})
        if not self._safe_click(l_input["x"], l_input["y"], clicks=2):
            return False, copied_price

        # Read existing value currently inside the popup box
        pyautogui.hotkey("ctrl", "a")
        self._safe_sleep(0.05)
        pyautogui.hotkey("ctrl", "c")
        self._safe_sleep(0.1)

        try:
            existing_text = pyperclip.paste().strip()
        except Exception:
            existing_text = ""

        existing_num = extract_numeric_value(existing_text)
        target_num = extract_numeric_value(copied_price)

        # CASE A: Value is ALREADY matching (e.g. 0.19 == 0.19)
        # Note: In Google Play Console, if the value matches, the 'Save' button is DISABLED (greyed out).
        # Trying to click Save will fail to close the dialog. We cleanly close it via Escape or Cancel.
        if existing_num is not None and target_num is not None and abs(existing_num - target_num) < 0.0001:
            self.log(f"[{c_name}] ✨ Value already matches target ({existing_num} == {target_num}). No change needed!")
            self.set_state(AutomatorState.RUNNING, f"[{c_name}] Value matches ({copied_price}). Closing popup...")
            
            # Press Escape to close popup cleanly
            pyautogui.press("escape")
            self._safe_sleep(0.2)
            
            # Fallback click on Cancel button if still open
            l_cancel = coords.get("left_popup_cancel", {"x": 650, "y": 1210})
            self._safe_click(l_cancel["x"], l_cancel["y"])
            
            if not self._safe_sleep(timing.get("post_save_delay", 0.8)):
                return False, copied_price
            return True, copied_price

        # CASE B: Value DOES NOT match (e.g. existing is 0.29, but right window has 0.19) or empty
        # We completely clear the input box and re-enter the correct target price!
        if existing_num is not None:
            self.log(f"[{c_name}] 🔄 Mismatch detected! Existing '{existing_text}' != Target '{copied_price}'. Overwriting with correct value...")
        else:
            self.log(f"[{c_name}] ✍️ Setting price: '{copied_price}'...")

        self.set_state(AutomatorState.RUNNING, f"[{c_name}] Overwriting with {copied_price}...")
        
        # Clear existing text
        pyautogui.hotkey("ctrl", "a")
        pyautogui.press("backspace")
        self._safe_sleep(0.05)
        
        # Enter correct value from right window
        self._safe_write(copied_price)
        if not self._safe_sleep(0.35):
            return False, copied_price

        # -------------------------------------------------------------
        # STEP 5: Click Save Button (Active now because value changed)
        # -------------------------------------------------------------
        self.set_state(AutomatorState.RUNNING, f"[{c_name}] Saving price...")

        l_save = coords.get("left_popup_save", {"x": 730, "y": 1210})
        if not self._safe_click(l_save["x"], l_save["y"]):
            return False, copied_price

        # Wait for popup to close and row to update
        if not self._safe_sleep(timing.get("post_save_delay", 0.8)):
            return False, copied_price

        self.log(f"[{c_name}] ✅ Successfully set price to {copied_price}")
        return True, copied_price

