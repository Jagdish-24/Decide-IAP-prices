"""
Configuration and Coordinate Manager for Play Sale Automator.
Handles screen calibration, delay timings, and persistent cache storage.
"""

import os
import json
import pyautogui

CONFIG_DIR = os.path.join(os.path.dirname(__file__), "cache")
CONFIG_FILE = os.path.join(CONFIG_DIR, "config.json")

# Application Version Telemetry (Follows SemVer Major.Minor.Micro)
APP_VERSION = "1.7.4"
APP_LAST_UPDATED = "25 Oct 2026"

def get_default_coordinates():
    """
    Computes responsive default coordinates based on screen size (default 2560x1440 or proportional).
    Left window: Google Play Console (0 to width/2)
    Right window: PlayPriceEngine (width/2 to width)
    """
    w, h = pyautogui.size()
    
    # Accurate normalized coordinates derived from Google Play Console Material 3 layout
    return {
        # Left Window (Google Play Console)
        "left_search_box": {
            "x": int(w * 0.373),  # ~955 on 2560 (Search by country or region pill)
            "y": int(h * 0.255)   # ~367 on 1440
        },
        "left_row_pencil": {
            "x": int(w * 0.213),  # ~545 on 2560 (Sale price pencil icon in filtered row 1)
            "y": int(h * 0.326)   # ~470 on 1440
        },
        "left_popup_input": {
            "x": int(w * 0.215),  # ~550 on 2560 (Input box in Edit price popup)
            "y": int(h * 0.389)   # ~560 on 1440
        },
        "left_popup_cancel": {
            "x": int(w * 0.199),  # ~510 on 2560 (Cancel button in Edit price popup)
            "y": int(h * 0.434)   # ~625 on 1440
        },
        "left_popup_save": {
            "x": int(w * 0.225),  # ~575 on 2560 (Save button in Edit price popup)
            "y": int(h * 0.434)   # ~625 on 1440
        },
        
        # Right Window (PlayPriceEngine fallback)
        "right_search_box": {
            "x": int(w * 0.890),  # ~2280 on 2560 (Filter countries search input)
            "y": int(h * 0.225)   # ~324 on 1440
        },
        "right_copy_button": {
            "x": int(w * 0.765),  # ~1958 on 2560 (Copy button next to first row discounted price)
            "y": int(h * 0.285)   # ~410 on 1440
        }
    }

DEFAULT_CONFIG = {
    "screen_resolution": list(pyautogui.size()),
    "coordinates": get_default_coordinates(),
    "timing": {
        "pre_start_delay": 5.0,        # 5-second countdown before moving mouse
        "user_pause_duration": 10.0,    # 10-second pause if user moves mouse
        "mouse_move_duration": 0.25,   # Smooth human-like cursor glide
        "step_delay": 0.7,             # Default pause after clicks/keystrokes
        "search_delay": 0.8,           # Wait for table to filter after search
        "popup_delay": 0.8,            # Wait for Edit price popup to open/close
        "post_save_delay": 0.8         # Wait for change to reflect in table
    },
    "automation_mode": "single_window",   # "single_window" (Play Console only) or "dual_window"
    "pricing_target_mode": "sale",       # "sale" (Mode 2: Sale Prices) or "retail" (Mode 1: Base Prices)
    "verify_clipboard": True,
    "last_processed_index": 0
}

def load_config():
    """Loads configuration from JSON file or generates defaults."""
    os.makedirs(CONFIG_DIR, exist_ok=True)
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                saved = json.load(f)
                merged = dict(DEFAULT_CONFIG)
                merged.update(saved)

                # Sanitize legacy stale coordinates if search box Y is pointing to bottom of page (> 500)
                coords = merged.get("coordinates", {})
                if coords.get("left_search_box", {}).get("y", 0) > 500:
                    merged["coordinates"] = get_default_coordinates()
                    save_config(merged)
                return merged
        except Exception as e:
            print(f"[Config] Error loading config file, resetting to defaults: {e}")
    return dict(DEFAULT_CONFIG)

def save_config(cfg):
    """Saves configuration to JSON file."""
    os.makedirs(CONFIG_DIR, exist_ok=True)
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2)
        return True
    except Exception as e:
        print(f"[Config] Error saving config file: {e}")
        return False
