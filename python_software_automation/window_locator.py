"""
Window Locator & Interactive Calibration Helper.
Detects side-by-side split screen browser windows and provides easy 1-click coordinate calibration.
"""

import time
import pyautogui

try:
    import win32gui
except ImportError:
    win32gui = None

class WindowLocator:
    def __init__(self, config):
        self.config = config

    def check_dual_windows(self):
        """
        Scans for Google Play Console and PlayPriceEngine / GitHub / localhost windows.
        Returns a summary dict with detection results.
        """
        results = {
            "play_console_found": False,
            "play_console_title": None,
            "engine_found": False,
            "engine_title": None,
            "screen_size": pyautogui.size()
        }

        if not win32gui:
            return results

        def enum_callback(hwnd, extra):
            if win32gui.IsWindowVisible(hwnd):
                title = win32gui.GetWindowText(hwnd).strip()
                if not title:
                    return
                lower = title.lower()
                # Check for Google Play Console
                if "play console" in lower or "google play" in lower or "edit sale" in lower:
                    results["play_console_found"] = True
                    results["play_console_title"] = title
                # Check for PlayPriceEngine
                if "playprice" in lower or "decide iap" in lower or "decide-iap-prices" in lower or "jagdish-24.github.io" in lower:
                    results["engine_found"] = True
                    results["engine_title"] = title

        try:
            win32gui.EnumWindows(enum_callback, None)
        except Exception as e:
            print(f"[WindowLocator] Enum error: {e}")

        return results

    @staticmethod
    def capture_point_with_countdown(label, countdown_sec=3, on_tick=None):
        """
        Counts down while the user moves their mouse to the target element,
        then returns the captured (x, y) coordinates.
        """
        for i in range(countdown_sec, 0, -1):
            if on_tick:
                on_tick(f"Hover over [{label}]... {i}s")
            time.sleep(1.0)
            
        pos = pyautogui.position()
        if on_tick:
            on_tick(f"Captured [{label}] at {pos}")
        return {"x": pos.x, "y": pos.y}
