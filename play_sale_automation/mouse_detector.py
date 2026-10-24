"""
Mouse Movement and Intervention Detector.
Detects when the user manually moves the mouse while the bot is active,
instantly yielding control and pausing for 10 seconds before resuming.
"""

import time
import math
import threading
import pyautogui

class MouseInterventionDetector:
    def __init__(self, pause_duration=10.0, movement_threshold=15.0):
        self.pause_duration = pause_duration
        self.movement_threshold = movement_threshold
        
        self.bot_is_moving = False
        self.last_expected_pos = pyautogui.position()
        self.user_pause_until = 0.0
        self.running = False
        self._thread = None
        self._on_pause_callbacks = []
        self._on_resume_callbacks = []

    def start(self):
        """Starts background mouse tracking."""
        self.running = True
        self.last_expected_pos = pyautogui.position()
        self._thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self._thread.start()

    def stop(self):
        """Stops background mouse tracking."""
        self.running = False
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=0.5)

    def register_bot_action(self, target_pos):
        """Informs the detector that the bot intentionally moved the mouse."""
        self.bot_is_moving = True
        self.last_expected_pos = target_pos
        # Allow short grace time for OS cursor move to settle
        time.sleep(0.05)
        self.bot_is_moving = False

    def is_paused(self):
        """Returns True if currently in a 10-second user-intervention pause."""
        return time.time() < self.user_pause_until

    def get_remaining_pause(self):
        """Returns remaining seconds for the 10-second pause."""
        rem = self.user_pause_until - time.time()
        return max(0.0, rem)

    def trigger_pause(self):
        """Forces a 10-second user pause."""
        self.user_pause_until = time.time() + self.pause_duration
        for cb in self._on_pause_callbacks:
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
                
                # Check distance from last known expected position
                if not self.bot_is_moving:
                    dist = math.hypot(cur_pos[0] - self.last_expected_pos[0],
                                      cur_pos[1] - self.last_expected_pos[1])
                    if dist > self.movement_threshold:
                        # User physically moved the mouse!
                        self.trigger_pause()
                        self.last_expected_pos = cur_pos

                # Check if pause expired
                is_currently_paused = time.time() < self.user_pause_until
                if was_paused and not is_currently_paused:
                    # Just resumed
                    self.last_expected_pos = pyautogui.position()
                    for cb in self._on_resume_callbacks:
                        try:
                            cb()
                        except Exception:
                            pass
                was_paused = is_currently_paused

            except Exception:
                pass
            
            time.sleep(0.05)  # 20 Hz polling is lightweight and responsive
