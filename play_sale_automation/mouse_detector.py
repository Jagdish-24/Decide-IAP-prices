"""
Mouse Movement and Intervention Detector.
Detects when the user manually moves the mouse while the bot is active,
instantly yielding control and pausing for 10 seconds before resuming.
Distinguishes bot actions from genuine user movements using synchronized execution guards.
"""

import time
import math
import threading
from contextlib import contextmanager
import pyautogui


class MouseInterventionDetector:
    def __init__(self, pause_duration=10.0, movement_threshold=20.0):
        self.pause_duration = pause_duration
        self.movement_threshold = movement_threshold

        self.bot_is_moving = False
        self.last_expected_pos = pyautogui.position()
        self.user_pause_until = 0.0
        self.running = False
        self._thread = None
        self._on_pause_callbacks = []
        self._on_resume_callbacks = []
        self._lock = threading.Lock()

    def start(self):
        """Starts background mouse tracking."""
        self.running = True
        self.bot_is_moving = False
        self.last_expected_pos = pyautogui.position()
        self._thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self._thread.start()

    def stop(self):
        """Stops background mouse tracking."""
        self.running = False
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=0.5)

    @contextmanager
    def bot_movement(self):
        """
        Synchronized context manager for bot-driven mouse movements and clicks.
        Prevents false-positive user intervention triggers during automated actions.
        """
        with self._lock:
            self.bot_is_moving = True
        try:
            yield
        finally:
            # Allow OS mouse events and cursor hardware to settle
            time.sleep(0.06)
            with self._lock:
                self.last_expected_pos = pyautogui.position()
                self.bot_is_moving = False

    def register_bot_action(self, target_pos):
        """Informs the detector that the bot moved the mouse (legacy compatibility)."""
        with self._lock:
            self.bot_is_moving = True
            self.last_expected_pos = target_pos
        time.sleep(0.06)
        with self._lock:
            self.last_expected_pos = pyautogui.position()
            self.bot_is_moving = False

    def is_paused(self):
        """Returns True if currently in a user-intervention pause."""
        return time.time() < self.user_pause_until

    def get_remaining_pause(self):
        """Returns remaining seconds for the pause."""
        rem = self.user_pause_until - time.time()
        return max(0.0, rem)

    def trigger_pause(self):
        """Forces a user intervention pause."""
        self.user_pause_until = time.time() + self.pause_duration
        for cb in list(self._on_pause_callbacks):
            try:
                cb(self.pause_duration)
            except Exception:
                pass

    def add_on_pause(self, cb):
        self._on_pause_callbacks.append(cb)

    def add_on_resume(self, cb):
        self._on_resume_callbacks.append(cb)

    def _monitor_loop(self):
        was_paused = False
        while self.running:
            try:
                cur_pos = pyautogui.position()

                with self._lock:
                    is_bot_active = self.bot_is_moving
                    expected = self.last_expected_pos

                if is_bot_active:
                    # Bot is actively driving the cursor; track current position
                    with self._lock:
                        self.last_expected_pos = cur_pos
                else:
                    dist = math.hypot(cur_pos[0] - expected[0], cur_pos[1] - expected[1])
                    if dist > self.movement_threshold:
                        # Genuine user physical mouse movement detected!
                        self.trigger_pause()
                        with self._lock:
                            self.last_expected_pos = cur_pos
                    else:
                        # Update expected to avoid accumulating micro sensor drift
                        with self._lock:
                            self.last_expected_pos = cur_pos

                # Check if pause expired
                is_currently_paused = time.time() < self.user_pause_until
                if was_paused and not is_currently_paused:
                    # Just resumed from user pause
                    with self._lock:
                        self.last_expected_pos = pyautogui.position()
                    for cb in list(self._on_resume_callbacks):
                        try:
                            cb()
                        except Exception:
                            pass
                was_paused = is_currently_paused

            except Exception:
                pass

            time.sleep(0.04)  # 25 Hz monitoring is fast, lightweight, and responsive
