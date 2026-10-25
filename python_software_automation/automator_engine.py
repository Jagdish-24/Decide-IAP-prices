"""
Play Sale Automator Core Execution Engine.
Automates copying prices from PlayPriceEngine and setting them in Google Play Console,
with user-intervention detection, fail-safe delays, and step-by-step progress tracking.
"""

import time
import re
import random
import threading
from datetime import datetime
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

def get_humanized_delay(base_delay):
    """
    Proportional natural human jitter (±15% to 25%) ensuring EVERY cadence profile
    (Moderate 1000ms, Safe & Steady 1600ms, Ultra-Safe 2500ms, Maximum Caution 3500ms)
    has realistic non-periodic variance between actions.
    base_delay can be given in seconds (e.g. 2.5) or ms (2500).
    If base_delay <= 0.05, returns as-is to preserve fast automated testing.
    """
    if base_delay <= 0.05:
        return base_delay

    is_seconds = base_delay < 50.0
    base_ms = base_delay * 1000.0 if is_seconds else float(base_delay)

    variance = max(160, int(round(base_ms * 0.18)))
    min_jitter = -int(round(variance * 0.75))
    max_jitter = variance
    jitter = random.randint(min_jitter, max_jitter)
    final_ms = max(500, base_ms + jitter)

    return (final_ms / 1000.0) if is_seconds else final_ms

def format_duration(seconds_or_ms):
    """Formats elapsed seconds or milliseconds into MM:SS or HH:MM:SS."""
    if seconds_or_ms is None or seconds_or_ms < 0:
        sec = 0
    elif seconds_or_ms > 10000 and isinstance(seconds_or_ms, (int, float)):
        sec = int(seconds_or_ms // 1000)
    else:
        sec = int(seconds_or_ms)

    hours = sec // 3600
    minutes = (sec % 3600) // 60
    seconds = sec % 60
    if hours > 0:
        return f"{hours:02d}:{minutes:02d}:{seconds:02d}"
    return f"{minutes:02d}:{seconds:02d}"

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

        # Stopwatch and Real-time Telemetry
        self.timer_start_time = None
        self.total_paused_seconds = 0.0
        self.pause_start_time = None
        self.recent_task_durations = []
        self.speed_delay_ms = int(self.config.get("speed_delay", 2500))

        # Callbacks for GUI integration
        self.on_state_change = None
        self.on_progress_update = None
        self.on_pause_tick = None
        self.on_log = None

        # Wire mouse detector events
        self.mouse_detector.add_on_pause(self._handle_user_pause)
        self.mouse_detector.add_on_resume(self._handle_user_resume)

    @property
    def speed_delay_seconds(self):
        """Returns the base cadence speed delay in seconds."""
        return self.speed_delay_ms / 1000.0

    def set_speed_delay(self, ms):
        """Sets safety cadence in milliseconds (e.g. 2500 for Ultra-Safe)."""
        self.speed_delay_ms = int(ms)
        self.config["speed_delay"] = int(ms)
        timing = self.config.setdefault("timing", {})
        timing["step_delay"] = int(ms) / 1000.0

    def start_timers(self):
        """Starts or unpauses elapsed stopwatch."""
        if not self.timer_start_time:
            self.timer_start_time = time.time()
            self.total_paused_seconds = 0.0
            self.pause_start_time = None
        elif self.pause_start_time:
            self.total_paused_seconds += (time.time() - self.pause_start_time)
            self.pause_start_time = None

    def pause_timers(self):
        """Pauses stopwatch during user mouse intervention or pauses."""
        if self.timer_start_time and not self.pause_start_time:
            self.pause_start_time = time.time()

    def resume_timers(self):
        """Resumes stopwatch after user pause finishes."""
        if self.pause_start_time:
            self.total_paused_seconds += (time.time() - self.pause_start_time)
            self.pause_start_time = None

    def stop_timers(self, reset=False):
        """Stops or resets stopwatch telemetry."""
        if self.pause_start_time:
            self.total_paused_seconds += (time.time() - self.pause_start_time)
            self.pause_start_time = None
        if reset:
            self.timer_start_time = None
            self.total_paused_seconds = 0.0
            self.pause_start_time = None
            self.recent_task_durations = []

    def get_elapsed_seconds(self):
        """Returns active elapsed time in seconds, excluding pauses."""
        if not self.timer_start_time:
            return 0.0
        now = time.time()
        paused = self.total_paused_seconds + (now - self.pause_start_time if self.pause_start_time else 0.0)
        return max(0.0, now - self.timer_start_time - paused)

    def get_timer_telemetry(self):
        """
        Calculates elapsed stopwatch string and rolling ETA completion string.
        Matches the browser bot telemetry exactly:
        - Uses rolling 5-task moving average
        - Fallback baseline: speed_delay + modal overhead (~3s)
        - Format: ~05:40 (ETA: 05:12 PM)
        - Shows Completed 🎉 when finished
        """
        elapsed_sec = self.get_elapsed_seconds()
        elapsed_str = format_duration(elapsed_sec)

        total = len(self.countries)
        if total == 0:
            return {
                "elapsed_str": elapsed_str,
                "remaining_str": "--:--",
                "is_completed": False
            }

        completed = self.current_country_index
        if self.state == AutomatorState.COMPLETED:
            completed = total

        remaining = max(0, total - completed)
        if completed >= total and total > 0:
            return {
                "elapsed_str": elapsed_str,
                "remaining_str": "Completed 🎉",
                "is_completed": True
            }

        now = time.time()
        if self.recent_task_durations:
            avg_task_sec = sum(self.recent_task_durations) / len(self.recent_task_durations)
            prefix = ""
        else:
            avg_task_sec = self.speed_delay_seconds + 3.0
            prefix = "~"

        remaining_sec = remaining * avg_task_sec
        eta_ts = now + remaining_sec
        try:
            eta_str = datetime.fromtimestamp(eta_ts).strftime("%I:%M %p").lstrip("0")
        except Exception:
            eta_str = "--:--"

        rem_duration_str = format_duration(remaining_sec)
        return {
            "elapsed_str": elapsed_str,
            "remaining_str": f"{prefix}{rem_duration_str} (ETA: {eta_str})",
            "is_completed": False
        }

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
        self.pause_timers()
        if self.state in [AutomatorState.RUNNING, AutomatorState.COUNTDOWN]:
            self.set_state(AutomatorState.PAUSED, f"User mouse movement detected! Paused for {duration:.0f}s...")
            self.log(f"⚠️ User mouse movement detected! Pausing for {duration:.0f}s before resuming...")

    def _handle_user_resume(self):
        if not getattr(self, "user_manual_pause", False):
            self.resume_timers()
            if self.state == AutomatorState.PAUSED and not self.stop_requested:
                self.set_state(AutomatorState.RUNNING, "Resuming automation...")
                self.log("✅ Mouse is steady. Resuming automation...")

    def pause(self):
        """Manually pauses automation from GUI control."""
        if self.state in [AutomatorState.RUNNING, AutomatorState.COUNTDOWN]:
            self.user_manual_pause = True
            self.pause_timers()
            self.set_state(AutomatorState.PAUSED, "Automation paused by user.")
            self.log("⏸ Automation paused by user.")

    def resume(self):
        """Resumes automation from manual user pause."""
        if self.state == AutomatorState.PAUSED and not self.stop_requested:
            self.user_manual_pause = False
            self.resume_timers()
            self.set_state(AutomatorState.RUNNING, "Resuming automation...")
            self.log("▶ Resuming automation...")

    def start(self, start_index=0):
        """Starts automation loop from start_index in a background thread."""
        if self.state in [AutomatorState.RUNNING, AutomatorState.COUNTDOWN]:
            return
        
        self.stop_requested = False
        self.user_manual_pause = False
        self.current_country_index = start_index
        self.mouse_detector.start()
        self.start_timers()
        
        self.worker_thread = threading.Thread(target=self._run_loop, daemon=True)
        self.worker_thread.start()

    def stop(self):
        """Requests immediate stop of automation."""
        self.stop_requested = True
        self.user_manual_pause = False
        self.pause_timers()
        self.set_state(AutomatorState.STOPPED, "Automation stopped by user.")
        self.log("🛑 Automation stopped.")
        self.mouse_detector.stop()

    def test_single_country(self, country_index):
        """Runs automation for just 1 single country safely to test coordinates."""
        if self.state in [AutomatorState.RUNNING, AutomatorState.COUNTDOWN]:
            return
        
        self.stop_requested = False
        self.user_manual_pause = False
        self.current_country_index = country_index
        self.mouse_detector.start()
        self.start_timers()
        
        self.worker_thread = threading.Thread(target=self._run_single_test, args=(country_index,), daemon=True)
        self.worker_thread.start()

    def _safe_sleep(self, seconds):
        """Sleeps in small slices while checking for stop or user-pause events."""
        end_time = time.time() + seconds
        while time.time() < end_time:
            if self.stop_requested:
                return False

            # If user manually paused via GUI button
            while getattr(self, "user_manual_pause", False) and not self.stop_requested:
                time.sleep(0.1)
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
        
        task_start_time = time.time()
        task_start_paused = self.total_paused_seconds + (time.time() - self.pause_start_time if self.pause_start_time else 0.0)

        success, final_price = self._process_country(country, index)
        is_matched = getattr(self, "last_country_matched", False)
        status_label = "matched" if is_matched else ("completed" if success else "failed")

        # Record active duration of this test
        task_current_paused = self.total_paused_seconds + (time.time() - self.pause_start_time if self.pause_start_time else 0.0)
        task_active_sec = max(0.0, time.time() - task_start_time - (task_current_paused - task_start_paused))
        if task_active_sec > 0.2:
            self.recent_task_durations.append(task_active_sec)
            if len(self.recent_task_durations) > 5:
                self.recent_task_durations.pop(0)

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
        processed_since_last_cooldown = 0

        # 2. Main processing loop
        for idx in range(self.current_country_index, total_countries):
            if self.stop_requested:
                break

            # Rate-limiting safeguard: breathing rest cooldown every 25 processed items with natural jitter
            if processed_since_last_cooldown > 0 and processed_since_last_cooldown % 25 == 0 and idx < total_countries - 1:
                break_dur = random.randint(2800, 3600) / 1000.0
                self.log(f"🛡️ Rate-Limit Safeguard: Taking a natural {break_dur:.1f}s rest break... ({processed_since_last_cooldown} countries processed)")
                if not self._safe_sleep(break_dur):
                    break

            country = self.countries[idx]
            self.current_country_index = idx

            if self.on_progress_update:
                self.on_progress_update(idx, total_countries, country, "processing", "")

            task_start_time = time.time()
            task_start_paused = self.total_paused_seconds + (time.time() - self.pause_start_time if self.pause_start_time else 0.0)

            success, final_price = self._process_country(country, idx)
            is_matched = getattr(self, "last_country_matched", False)
            status_label = "matched" if is_matched else ("completed" if success else "failed")

            # Record active duration of this country task (excluding user pause intervals)
            task_current_paused = self.total_paused_seconds + (time.time() - self.pause_start_time if self.pause_start_time else 0.0)
            task_active_sec = max(0.0, time.time() - task_start_time - (task_current_paused - task_start_paused))
            if task_active_sec > 0.2:
                self.recent_task_durations.append(task_active_sec)
                if len(self.recent_task_durations) > 5:
                    self.recent_task_durations.pop(0)

            processed_since_last_cooldown += 1

            if not success:
                if self.stop_requested:
                    break
                self.log(f"⚠️ Warning: Could not complete {country['name']}, proceeding to next...")

            if self.on_progress_update:
                self.on_progress_update(idx + 1, total_countries, country, status_label, final_price)

            # Pause between countries with natural human jitter cadence
            inter_delay = get_humanized_delay(self.speed_delay_seconds)
            if not self._safe_sleep(inter_delay):
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
        2. Locates search bar, triple-clicks to select all text, pastes country name & captures Screenshot 2.
        3. Locates edit pencil icon in filtered row 1 & opens popup.
        4. Double-clicks price input, reads existing value.
           - If matched: cleanly closes dialog and continues immediately to next country.
           - If mismatched: pastes target price from CSV, clicks Save, & captures Screenshot 4.
        Maintains at most 5 screenshots in python_software_automation/screenshots/.
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
                unit_str = country.get('currency', '')
                mode_label = "Retail Price"
            elif pricing_mode == "discount_pct":
                raw_val = country.get("discount_pct", 0.0)
                unit_str = "%"
                mode_label = "Discount Percentage"
            else:
                raw_val = country.get("sale_price", country.get("retail_price", 0.0))
                unit_str = country.get('currency', '')
                mode_label = "Discounted Retail Price"

            try:
                if pricing_mode == "discount_pct":
                    raw_str = str(country.get("discount_pct_raw") or country.get("discount_pct", "0")).replace("%", "").strip()
                    f_val = abs(float(raw_str)) if raw_str else 0.0
                    if "." in raw_str and len(raw_str.split(".")[-1]) == 3:
                        copied_price = raw_str
                    elif f_val.is_integer():
                        copied_price = str(int(f_val))
                    else:
                        copied_price = f"{f_val:.3f}"
                else:
                    f_val = float(raw_val)
                    if f_val.is_integer():
                        copied_price = str(int(f_val))
                    else:
                        copied_price = f"{f_val:.2f}"
            except Exception:
                copied_price = str(raw_val)

            suffix = f" {unit_str}".rstrip()
            self.log(f"[{c_name}] 🎯 Target {mode_label} from file: '{copied_price}'{suffix}")

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
                if pricing_mode == "discount_pct":
                    copied_price = copied_price.rstrip('%').strip()
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
        # STEP 2: Triple-Click Search Bar, Paste Country Directly (Screenshot 2)
        # -------------------------------------------------------------
        self.set_state(AutomatorState.RUNNING, f"[{c_name}] Locating search bar & filtering...")

        l_search = coords.get("left_search_box", {"x": 955, "y": 367})
        search_x, search_y = l_search["x"], l_search["y"]
        if self.config.get("auto_detect_visual", False):
            dyn_search = locate_search_bar_visual()
            if dyn_search:
                search_x, search_y = dyn_search
                self.log(f"[{c_name}] 👁️ Visually located search bar at ({search_x}, {search_y})")

        # Triple-click to select all text in the search bar
        if not self._safe_click(search_x, search_y, clicks=3):
            return False, copied_price

        # Brief pause to allow selection highlight to register
        if not self._safe_sleep(0.08):
            return False, copied_price

        # Paste the current task country name directly over the selection (no backspace needed)
        search_query = "New countries/regions" if "new countries" in c_name.lower() else c_name
        self._safe_write(search_query)
        self._safe_press("enter")

        # Wait for left table to filter to row 1
        s_delay = float(timing.get("search_delay", 0.8))
        if not self._safe_sleep(get_humanized_delay(s_delay)):
            return False, copied_price

        self.log(f"[{c_name}] 📸 Step 2: Searched '{search_query}' in Google Play Console. Capturing screenshot...")
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

        # Offset row pencil if targeting child rows under expandable 'New countries/regions'
        c_lower = c_name.lower()
        if "new countries" in c_lower:
            if "usd" in c_lower:
                pencil_y += 48
                self.log(f"[{c_name}] 🌐 Targeting 'New countries/regions (USD)' on Row 2 (offset +48px)")
            elif "eur" in c_lower:
                pencil_y += 96
                self.log(f"[{c_name}] 🌐 Targeting 'New countries/regions (EUR)' on Row 3 (offset +96px)")

        if not self._safe_click(pencil_x, pencil_y, clicks=1):
            return False, copied_price

        # Wait for popup to open
        p_delay = float(timing.get("popup_delay", 0.8))
        if not self._safe_sleep(get_humanized_delay(p_delay)):
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
        match_tolerance = 0.001 if pricing_mode == "discount_pct" else 0.0001
        if existing_num is not None and target_num is not None and abs(existing_num - target_num) < match_tolerance:
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

        # Wait for popup to close and row to update (wait at least 3.0s - 3.5s for Google Play Console to save)
        post_delay = max(3.0, float(timing.get("post_save_delay", 3.0)))
        if not self._safe_sleep(post_delay):
            return False, copied_price

        self.screenshot_mgr.capture_and_save("step4_saved_verified", label=c_name)
        self.log(f"[{c_name}] 📸 Step 4: Successfully set price to {copied_price} & verified with screenshot.")
        return True, copied_price


