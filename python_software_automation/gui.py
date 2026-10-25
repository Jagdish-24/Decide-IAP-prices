"""
GUI Interface for Google Play Sale Price Automator.
Features modern, high-contrast, polished dark theme aesthetics, split-screen optimized layout,
live progress tracking, tier-filtered country queue, visual coordinate calibration with preview,
and global hotkeys (F8 start / F9 stop).
"""

import os
import json
import time
import threading
import tkinter as tk
from tkinter import ttk, messagebox, filedialog
import pyautogui
import sys
import webbrowser

# Enable native Windows per-monitor High-DPI font rasterization
try:
    from ctypes import windll
    windll.shcore.SetProcessDpiAwareness(1)
except Exception:
    pass

# Ensure local package modules can be imported regardless of execution working directory
_pkg_dir = os.path.dirname(os.path.abspath(__file__))
if _pkg_dir not in sys.path:
    sys.path.insert(0, _pkg_dir)

from config import (
    load_config,
    save_config,
    get_default_coordinates,
    APP_VERSION,
    APP_LAST_UPDATED,
    CADENCE_PRESETS,
    CADENCE_CODE_TO_DISPLAY,
    CADENCE_DISPLAY_TO_CODE
)
from mouse_detector import MouseInterventionDetector
from automator_engine import PlaySaleAutomatorEngine, AutomatorState, format_duration
from window_locator import WindowLocator
from file_parser import parse_pricing_file
from visual_calibrator import (
    capture_desktop_image,
    generate_point_crop,
    ScreenPinOverlay,
    locate_search_bar_visual,
    locate_first_row_pencil_visual
)
from PIL import Image, ImageTk

# Attempt global hotkeys with pynput
try:
    from pynput import keyboard as pynput_keyboard
    HAS_PYNPUT = True
except ImportError:
    HAS_PYNPUT = False

TASK_MODES = [
    ("retail", "1. Set Retail Price"),
    ("sale", "2. Set Discounted Retail Price"),
    ("discount_pct", "3. Set Discount Percentage")
]
CODE_TO_DISPLAY = {k: v for k, v in TASK_MODES}
DISPLAY_TO_CODE = {v: k for k, v in TASK_MODES}


class PlaySaleAutomatorGUI(tk.Tk):
    def __init__(self):
        super().__init__()

        self.title("PlayPrice Automator • Google Play Console Robot")
        # Optimized default geometry for modern displays and split-screen snapping
        self.geometry("1160x780")
        self.minsize(960, 650)
        self.configure(bg="#0B0F19")

        # Load data and configuration
        self.config_data = load_config()
        self.countries = self._load_countries()
        self.loaded_file_name = "default_pricing_matrix.csv"
        self.current_tier_filter = "all"
        self._load_initial_pricing_matrix()

        # Initialize core components
        self.mouse_detector = MouseInterventionDetector(
            pause_duration=self.config_data.get("timing", {}).get("user_pause_duration", 10.0)
        )
        self.engine = PlaySaleAutomatorEngine(self.config_data, self.countries, self.mouse_detector)
        self.window_locator = WindowLocator(self.config_data)

        # Wire engine callbacks
        self.engine.on_state_change = self._on_engine_state_change
        self.engine.on_progress_update = self._on_engine_progress_update
        self.engine.on_pause_tick = self._on_engine_pause_tick
        self.engine.on_log = self._on_engine_log

        # Build UI layout
        self._init_theme()
        self._build_header()
        self._build_config_card()
        self._build_hero_card()
        self._build_tabs()
        self._build_footer()

        # Setup Global Hotkeys
        self._init_hotkeys()

        # Start periodic GUI clock for window check & telemetry timers
        self.after(1000, self._periodic_window_check)
        self.after(200, self._timer_tick)

    def _load_initial_pricing_matrix(self):
        default_csv = os.path.join(os.path.dirname(__file__), "default_pricing_matrix.csv")
        if os.path.exists(default_csv):
            try:
                parsed = parse_pricing_file(default_csv)
                self._apply_parsed_prices(parsed)
            except Exception as e:
                print(f"[GUI] Error loading default matrix: {e}")

    def _apply_parsed_prices(self, parsed):
        for c in self.countries:
            name = c.get("name")
            code = c.get("code")
            item = parsed.get(name) or parsed.get(code)
            if item:
                c["retail_price"] = item.get("retail_price", 0.0)
                c["sale_price"] = item.get("sale_price", 0.0)

    def _load_countries(self):
        json_path = os.path.join(os.path.dirname(__file__), "countries_data.json")
        if os.path.exists(json_path):
            with open(json_path, "r", encoding="utf-8") as f:
                return json.load(f)
        return []

    def _init_theme(self):
        self.colors = {
            "bg": "#0B0F19",             # Rich obsidian base background
            "card_bg": "#111827",        # Card elevation surface (slate-900)
            "card_border": "#1F2937",    # Clean subtle 1px border (slate-800)
            "card_inner": "#0D1424",     # Inset sub-container background
            "card_inner_border": "#1E293B",
            "accent": "#38BDF8",         # Electric sky blue primary accent
            "accent_hover": "#0284C7",   # Darker accent for active states
            "accent_subtle": "#082F49",  # Soft background tint for badges
            "accent_border": "#0369A1",
            "success": "#10B981",        # Emerald green
            "success_hover": "#059669",
            "success_bg": "#064E3B",
            "success_border": "#047857",
            "danger": "#EF4444",         # Rose red
            "danger_hover": "#DC2626",
            "warning": "#F59E0B",        # Amber gold
            "warning_bg": "#451A03",
            "text": "#F9FAFB",           # Crisp pure white primary text
            "text_muted": "#9CA3AF",     # Refined light slate secondary text
            "text_dim": "#6B7280",       # Muted slate tertiary text
            "input_bg": "#0D1424",
            "input_border": "#334155",
            "tree_even": "#0F172A",      # Sleek alternating row even
            "tree_odd": "#131D31",       # Sleek alternating row odd
            "tree_select": "#1E3A8A",    # Selected row background
            "tree_select_fg": "#FFFFFF"
        }

        style = ttk.Style(self)
        style.theme_use("clam")

        # Custom Notebook Tabs
        style.configure("TNotebook", background=self.colors["bg"], borderwidth=0)
        style.configure("TNotebook.Tab", background=self.colors["card_bg"],
                        foreground=self.colors["text_muted"], padding=[20, 9],
                        font=("Segoe UI", 10, "bold"), borderwidth=0)
        style.map("TNotebook.Tab",
                  background=[("selected", "#1E293B"), ("active", "#1A2234")],
                  foreground=[("selected", self.colors["accent"]), ("active", self.colors["text"])])

        # Custom Treeview Table
        style.configure("Treeview", background=self.colors["card_bg"],
                        foreground=self.colors["text"], fieldbackground=self.colors["card_bg"],
                        font=("Segoe UI", 10), rowheight=34, borderwidth=0)
        style.configure("Treeview.Heading", background="#17233D",
                        foreground=self.colors["accent"], font=("Segoe UI", 9, "bold"),
                        borderwidth=0, relief="flat", padding=[8, 8])
        style.map("Treeview", background=[("selected", self.colors["tree_select"])],
                  foreground=[("selected", self.colors["tree_select_fg"])])

        # Progress bar
        style.configure("Horizontal.TProgressbar", background=self.colors["accent"],
                        troughcolor=self.colors["card_inner"], borderwidth=0, thickness=9)

        # Dropdown Combobox styling
        style.configure("TCombobox", fieldbackground=self.colors["input_bg"], background="#1E293B",
                        foreground=self.colors["text"], selectbackground=self.colors["accent"],
                        selectforeground="#000000", borderwidth=1, arrowcolor=self.colors["accent"],
                        padding=[6, 5])
        style.map("TCombobox", fieldbackground=[("readonly", self.colors["input_bg"])],
                  foreground=[("readonly", self.colors["text"])])

        # Custom Scrollbar styling
        style.configure("Vertical.TScrollbar", background="#1E293B", troughcolor=self.colors["card_bg"],
                        borderwidth=0, arrowcolor=self.colors["text_muted"], width=12)
        style.map("Vertical.TScrollbar", background=[("active", "#334155")])

    def _build_header(self):
        hdr = tk.Frame(self, bg=self.colors["bg"], padx=20, pady=12)
        hdr.pack(fill="x")

        # Left: App Brand & Subtitle
        left = tk.Frame(hdr, bg=self.colors["bg"])
        left.pack(side="left")

        brand_row = tk.Frame(left, bg=self.colors["bg"])
        brand_row.pack(anchor="w")

        # Modern Logo Badge (Electric Bolt Pill)
        logo_badge = tk.Frame(brand_row, bg=self.colors["accent_subtle"], padx=8, pady=3,
                              highlightbackground=self.colors["accent_border"], highlightthickness=1)
        logo_badge.pack(side="left", padx=(0, 10))

        tk.Label(logo_badge, text="⚡ AUTOMATOR", font=("Segoe UI", 9, "bold"),
                 fg=self.colors["accent"], bg=self.colors["accent_subtle"]).pack(side="left")

        title_lbl = tk.Label(brand_row, text="PlayPrice Automator",
                             font=("Segoe UI", 16, "bold"), fg=self.colors["text"], bg=self.colors["bg"])
        title_lbl.pack(side="left")

        sub_lbl = tk.Label(left, text="Google Play Console Pricing Robot • Single & Dual Window Sync",
                           font=("Segoe UI", 9), fg=self.colors["text_muted"], bg=self.colors["bg"])
        sub_lbl.pack(anchor="w", pady=(3, 0))

        # Right: Cohesive Meta Chip Strip
        right_meta = tk.Frame(hdr, bg=self.colors["bg"])
        right_meta.pack(side="right")

        # Version Pill
        ver_badge = tk.Frame(right_meta, bg=self.colors["card_bg"], padx=10, pady=5,
                             highlightbackground=self.colors["card_border"], highlightthickness=1)
        ver_badge.pack(side="right", padx=(8, 0))

        tk.Label(ver_badge, text=f"v{APP_VERSION}", font=("Segoe UI", 9, "bold"),
                 fg=self.colors["accent"], bg=self.colors["card_bg"]).pack(side="left")
        tk.Label(ver_badge, text="•", font=("Segoe UI", 9),
                 fg=self.colors["text_dim"], bg=self.colors["card_bg"]).pack(side="left", padx=5)
        tk.Label(ver_badge, text=f"{APP_LAST_UPDATED}", font=("Segoe UI", 9),
                 fg=self.colors["text_muted"], bg=self.colors["card_bg"]).pack(side="left")

        # Window Detection Pill
        self.win_status_pill = tk.Label(right_meta, text="● Play Console Detected • Ready",
                                        font=("Segoe UI", 9, "bold"), bg=self.colors["success_bg"],
                                        fg="#34D399", padx=12, pady=5,
                                        highlightthickness=1, highlightbackground=self.colors["success_border"])
        self.win_status_pill.pack(side="right", padx=(8, 0))

        # Direct Web App Link Button
        web_btn = tk.Button(right_meta, text="🌐 Open Web Engine ↗", font=("Segoe UI", 9, "bold"),
                            bg="#131F37", fg=self.colors["accent"],
                            activebackground="#1E293B", activeforeground="#FFFFFF",
                            bd=0, padx=12, pady=5, cursor="hand2", relief="flat",
                            highlightthickness=1, highlightbackground=self.colors["card_border"],
                            command=self._open_web_engine)
        web_btn.pack(side="right")

    def _open_web_engine(self):
        try:
            webbrowser.open("http://localhost:8080/index.html")
        except Exception:
            webbrowser.open("https://jagdish-24.github.io/Decide-IAP-prices/")

    def _build_config_card(self):
        """
        Organized Configuration Control Strip:
        Left: Task Automation Mode Dropdown
        Right: Active Pricing Matrix File & Change File button
        """
        card = tk.Frame(self, bg=self.colors["card_bg"], padx=18, pady=10,
                        highlightbackground=self.colors["card_border"], highlightthickness=1)
        card.pack(fill="x", padx=20, pady=(0, 10))

        col_left = tk.Frame(card, bg=self.colors["card_bg"])
        col_left.pack(side="left", fill="x", expand=True)

        col_right = tk.Frame(card, bg=self.colors["card_bg"])
        col_right.pack(side="right")

        # Left: Task Mode Selection Dropdown + Safety Cadence Selector
        mode_row = tk.Frame(col_left, bg=self.colors["card_bg"])
        mode_row.pack(anchor="w")

        tk.Label(mode_row, text="🎯 Task Mode:", font=("Segoe UI", 9, "bold"),
                 fg=self.colors["accent"], bg=self.colors["card_bg"]).pack(side="left", padx=(0, 6))

        curr_mode = self.config_data.get("pricing_target_mode", "sale")
        if curr_mode not in CODE_TO_DISPLAY:
            curr_mode = "sale"
        self.pricing_mode_var = tk.StringVar(value=curr_mode)
        self.mode_display_var = tk.StringVar(value=CODE_TO_DISPLAY[curr_mode])

        self.mode_dropdown = ttk.Combobox(
            mode_row,
            textvariable=self.mode_display_var,
            values=[v for _, v in TASK_MODES],
            state="readonly",
            font=("Segoe UI", 9, "bold"),
            width=26
        )
        self.mode_dropdown.pack(side="left", padx=(0, 16))
        self.mode_dropdown.bind("<<ComboboxSelected>>", self._on_change_pricing_mode)

        # Cadence Speed Preset
        tk.Label(mode_row, text="⏱️ Cadence:", font=("Segoe UI", 9, "bold"),
                 fg=self.colors["accent"], bg=self.colors["card_bg"]).pack(side="left", padx=(0, 6))

        curr_cadence = self.config_data.get("speed_delay", 2500)
        if curr_cadence not in CADENCE_CODE_TO_DISPLAY:
            curr_cadence = 2500
        self.cadence_display_var = tk.StringVar(value=CADENCE_CODE_TO_DISPLAY[curr_cadence])

        self.cadence_dropdown = ttk.Combobox(
            mode_row,
            textvariable=self.cadence_display_var,
            values=[v for _, v in CADENCE_PRESETS],
            state="readonly",
            font=("Segoe UI", 9, "bold"),
            width=34
        )
        self.cadence_dropdown.pack(side="left")
        self.cadence_dropdown.bind("<<ComboboxSelected>>", self._on_change_cadence)

        # Right: Matrix File & Load Button
        file_box = tk.Frame(col_right, bg=self.colors["card_inner"], padx=12, pady=5,
                            highlightbackground=self.colors["card_inner_border"], highlightthickness=1)
        file_box.pack(anchor="e")

        self.loaded_file_lbl = tk.Label(file_box, text=f"📄 {self.loaded_file_name}",
                                        font=("Segoe UI", 9, "bold"), fg=self.colors["accent"],
                                        bg=self.colors["card_inner"])
        self.loaded_file_lbl.pack(side="left", padx=(0, 12))

        btn_load = tk.Button(file_box, text="📁 Change File", font=("Segoe UI", 9, "bold"),
                             bg="#1E293B", fg=self.colors["text"], activebackground="#334155",
                             activeforeground="#FFFFFF", relief="flat", padx=10, pady=3,
                             cursor="hand2", command=self._on_click_load_file)
        btn_load.pack(side="right")

    def _on_change_cadence(self, event=None):
        disp = self.cadence_display_var.get()
        code = CADENCE_DISPLAY_TO_CODE.get(disp, 2500)
        self.config_data["speed_delay"] = code
        self.engine.set_speed_delay(code)
        save_config(self.config_data)
        self._on_engine_log(f"⏱️ Safety Cadence updated to: {disp}")

    def _on_change_pricing_mode(self, event=None):
        disp = self.mode_display_var.get()
        mode = DISPLAY_TO_CODE.get(disp, "sale")
        self.pricing_mode_var.set(mode)
        self.config_data["pricing_target_mode"] = mode
        save_config(self.config_data)
        self._populate_country_tree()
        self._on_engine_log(f"🔄 Switched task mode to: {disp}")

    def _on_click_load_file(self):
        path = filedialog.askopenfilename(
            title="Select Pricing Matrix File",
            filetypes=[("Pricing Matrix Files", "*.csv;*.json;*.js"), ("CSV Files (*.csv)", "*.csv"), ("JSON Files (*.json)", "*.json"), ("All Files", "*.*")]
        )
        if not path:
            return
        try:
            parsed = parse_pricing_file(path)
            self._apply_parsed_prices(parsed)
            self.loaded_file_name = os.path.basename(path)
            # Smart Mode auto-switch based on exported file naming
            fn_lower = self.loaded_file_name.lower()
            if ("discounted" in fn_lower or "sale" in fn_lower) and hasattr(self, "mode_display_var"):
                self.mode_display_var.set(CODE_TO_DISPLAY["sale"])
                self.pricing_mode_var.set("sale")
                self.config_data["pricing_target_mode"] = "sale"
                save_config(self.config_data)
            elif ("percentage" in fn_lower or "pct" in fn_lower) and hasattr(self, "mode_display_var"):
                self.mode_display_var.set(CODE_TO_DISPLAY["discount_pct"])
                self.pricing_mode_var.set("discount_pct")
                self.config_data["pricing_target_mode"] = "discount_pct"
                save_config(self.config_data)
            elif ("app price" in fn_lower or "app_price" in fn_lower or "retail" in fn_lower or "iap" in fn_lower) and hasattr(self, "mode_display_var"):
                self.mode_display_var.set(CODE_TO_DISPLAY["retail"])
                self.pricing_mode_var.set("retail")
                self.config_data["pricing_target_mode"] = "retail"
                save_config(self.config_data)

            if hasattr(self, "loaded_file_lbl"):
                self.loaded_file_lbl.config(text=f"📄 {self.loaded_file_name}")
            self._populate_country_tree()
            self._on_engine_log(f"✅ Successfully loaded {len(parsed)} prices from: {self.loaded_file_name}")
            messagebox.showinfo("File Loaded", f"Successfully loaded pricing matrix from {self.loaded_file_name} ({len(parsed)} countries)")
        except Exception as e:
            messagebox.showerror("Error Loading File", f"Could not parse file:\n{e}")

    def _build_hero_card(self):
        """
        Hero Command Center Card:
        Top: Status text & completion counter
        Middle: Rounded sleek progress bar
        Bottom: Big action buttons with live ticker
        """
        card = tk.Frame(self, bg=self.colors["card_bg"], padx=20, pady=14,
                        highlightbackground=self.colors["card_border"], highlightthickness=1)
        card.pack(fill="x", padx=20, pady=(0, 10))

        # Status text row
        top_row = tk.Frame(card, bg=self.colors["card_bg"])
        top_row.pack(fill="x", pady=(0, 8))

        self.status_icon_lbl = tk.Label(top_row, text="⚪", font=("Segoe UI", 12),
                                        bg=self.colors["card_bg"], fg=self.colors["text_muted"])
        self.status_icon_lbl.pack(side="left", padx=(0, 8))

        self.status_text_lbl = tk.Label(top_row, text="IDLE — Press Start (F8) to begin automation",
                                        font=("Segoe UI", 11, "bold"), bg=self.colors["card_bg"],
                                        fg=self.colors["text"])
        self.status_text_lbl.pack(side="left")

        self.progress_count_lbl = tk.Label(top_row, text="0 / 176 Countries (0%)",
                                          font=("Segoe UI", 11, "bold"), bg=self.colors["card_bg"],
                                          fg=self.colors["accent"])
        self.progress_count_lbl.pack(side="right")

        # Progress bar
        self.progress_bar = ttk.Progressbar(card, style="Horizontal.TProgressbar",
                                           orient="horizontal", mode="determinate", maximum=len(self.countries))
        self.progress_bar.pack(fill="x", pady=(0, 10))

        # Real-Time Telemetry Row: Elapsed Stopwatch & Est. Completion
        timers_row = tk.Frame(card, bg=self.colors["card_bg"])
        timers_row.pack(fill="x", pady=(0, 12))

        # 1. Elapsed Stopwatch Card (Left)
        card_elapsed = tk.Frame(timers_row, bg=self.colors["card_inner"], padx=14, pady=8,
                                highlightbackground=self.colors["card_inner_border"], highlightthickness=1)
        card_elapsed.pack(side="left", fill="x", expand=True, padx=(0, 8))

        tk.Label(card_elapsed, text="⏱️", font=("Segoe UI", 13),
                 bg=self.colors["card_inner"]).pack(side="left", padx=(0, 10))

        content_elapsed = tk.Frame(card_elapsed, bg=self.colors["card_inner"])
        content_elapsed.pack(side="left", fill="x")

        tk.Label(content_elapsed, text="Elapsed Stopwatch", font=("Segoe UI", 8, "bold"),
                 fg=self.colors["text_dim"], bg=self.colors["card_inner"]).pack(anchor="w")

        self.timer_elapsed_lbl = tk.Label(content_elapsed, text="00:00", font=("Consolas", 12, "bold"),
                                          fg="#38BDF8", bg=self.colors["card_inner"])
        self.timer_elapsed_lbl.pack(anchor="w")

        # 2. Est. Completion Card (Right)
        card_remaining = tk.Frame(timers_row, bg=self.colors["card_inner"], padx=14, pady=8,
                                 highlightbackground=self.colors["card_inner_border"], highlightthickness=1)
        card_remaining.pack(side="left", fill="x", expand=True, padx=(8, 0))

        tk.Label(card_remaining, text="⏳", font=("Segoe UI", 13),
                 bg=self.colors["card_inner"]).pack(side="left", padx=(0, 10))

        content_remaining = tk.Frame(card_remaining, bg=self.colors["card_inner"])
        content_remaining.pack(side="left", fill="x")

        tk.Label(content_remaining, text="Est. Completion", font=("Segoe UI", 8, "bold"),
                 fg=self.colors["text_dim"], bg=self.colors["card_inner"]).pack(anchor="w")

        self.timer_remaining_lbl = tk.Label(content_remaining, text="--:--", font=("Segoe UI", 11, "bold"),
                                            fg="#F59E0B", bg=self.colors["card_inner"])
        self.timer_remaining_lbl.pack(anchor="w")

        # Control buttons row
        btn_row = tk.Frame(card, bg=self.colors["card_bg"])
        btn_row.pack(fill="x")

        # Primary START Action Button (Vibrant Emerald)
        self.btn_start = tk.Button(btn_row, text="▶  START (F8)", font=("Segoe UI", 10, "bold"),
                                   bg=self.colors["success"], fg="#FFFFFF", activebackground=self.colors["success_hover"],
                                   activeforeground="#FFFFFF", relief="flat", padx=24, pady=7,
                                   cursor="hand2", command=self._on_click_start)
        self.btn_start.pack(side="left", padx=(0, 10))

        # STOP Action Button (Vibrant Rose)
        self.btn_stop = tk.Button(btn_row, text="■  STOP (F9 / Esc)", font=("Segoe UI", 10, "bold"),
                                  bg=self.colors["danger"], fg="#FFFFFF", activebackground=self.colors["danger_hover"],
                                  activeforeground="#FFFFFF", relief="flat", padx=20, pady=7,
                                  cursor="hand2", command=self._on_click_stop, state="disabled")
        self.btn_stop.pack(side="left", padx=(0, 10))

        # Single Country Test Button
        self.btn_test_one = tk.Button(btn_row, text="⚡ Test Single Country", font=("Segoe UI", 9, "bold"),
                                      bg="#1E293B", fg=self.colors["accent"], activebackground="#334155",
                                      activeforeground="#FFFFFF", relief="flat", padx=16, pady=7,
                                      cursor="hand2", command=self._on_click_test_one)
        self.btn_test_one.pack(side="left", padx=(0, 10))

        # Current Live Step Badge (Right Aligned)
        live_pill = tk.Frame(btn_row, bg=self.colors["card_inner"], padx=12, pady=5,
                             highlightbackground=self.colors["card_inner_border"], highlightthickness=1)
        live_pill.pack(side="right")

        tk.Label(live_pill, text="Live State:", font=("Segoe UI", 8, "bold"),
                 fg=self.colors["text_dim"], bg=self.colors["card_inner"]).pack(side="left", padx=(0, 6))

        self.active_task_lbl = tk.Label(live_pill, text="Ready", font=("Segoe UI", 9, "bold"),
                                        bg=self.colors["card_inner"], fg=self.colors["accent"])
        self.active_task_lbl.pack(side="left")

    def _build_tabs(self):
        tab_frame = tk.Frame(self, bg=self.colors["bg"])
        tab_frame.pack(fill="both", expand=True, padx=20, pady=(0, 8))

        self.notebook = ttk.Notebook(tab_frame)
        self.notebook.pack(fill="both", expand=True)

        # Tab 1: Country Queue
        self.queue_tab = tk.Frame(self.notebook, bg=self.colors["card_bg"])
        self.notebook.add(self.queue_tab, text="  📋 Country Queue (176)  ")
        self._build_queue_tab()

        # Tab 2: Calibration & Coordinates
        self.calib_tab = tk.Frame(self.notebook, bg=self.colors["card_bg"])
        self.notebook.add(self.calib_tab, text="  🎯 Screen Calibration  ")
        self._build_calibration_tab()

        # Tab 3: Delays & Timing
        self.timing_tab = tk.Frame(self.notebook, bg=self.colors["card_bg"])
        self.notebook.add(self.timing_tab, text="  ⏱️ Timings & Delays  ")
        self._build_timing_tab()

        # Tab 4: Activity Log
        self.log_tab = tk.Frame(self.notebook, bg=self.colors["card_bg"])
        self.notebook.add(self.log_tab, text="  📝 Activity Log  ")
        self._build_log_tab()

        self.notebook.bind("<<NotebookTabChanged>>", self._on_tab_changed)

    def _on_tab_changed(self, event):
        try:
            selected_tab = self.notebook.tab(self.notebook.select(), "text")
            if "Screen Calibration" in selected_tab:
                self.after(50, self._refresh_live_calibration_crops)
        except Exception:
            pass

    def _build_queue_tab(self):
        top_bar = tk.Frame(self.queue_tab, bg=self.colors["card_bg"], padx=14, pady=10)
        top_bar.pack(fill="x")

        # Quick Search Input Pill
        search_box = tk.Frame(top_bar, bg=self.colors["card_inner"], padx=8, pady=3,
                              highlightbackground=self.colors["input_border"], highlightthickness=1)
        search_box.pack(side="left", padx=(0, 14))

        tk.Label(search_box, text="🔍", font=("Segoe UI", 9),
                 fg=self.colors["text_muted"], bg=self.colors["card_inner"]).pack(side="left", padx=(0, 5))

        self.queue_search_var = tk.StringVar()
        self.queue_search_var.trace("w", self._filter_country_tree)
        search_entry = tk.Entry(search_box, textvariable=self.queue_search_var, font=("Segoe UI", 9),
                                bg=self.colors["card_inner"], fg=self.colors["text"],
                                insertbackground=self.colors["text"], width=22, relief="flat", bd=0)
        search_entry.pack(side="left", ipady=2)

        # Tier Filter Segmented Chips
        tk.Label(top_bar, text="Filter by Tier:", font=("Segoe UI", 9, "bold"),
                 fg=self.colors["text_muted"], bg=self.colors["card_bg"]).pack(side="left", padx=(0, 8))

        tier_strip = tk.Frame(top_bar, bg=self.colors["card_inner"], padx=3, pady=3,
                              highlightbackground=self.colors["card_border"], highlightthickness=1)
        tier_strip.pack(side="left")

        self.tier_btn_all = tk.Button(tier_strip, text="All (176)", font=("Segoe UI", 8, "bold"),
                                      bg=self.colors["accent"], fg="#000", relief="flat", padx=9, pady=2,
                                      cursor="hand2", command=lambda: self._set_tier_filter("all"))
        self.tier_btn_all.pack(side="left", padx=2)

        self.tier_btn_t1 = tk.Button(tier_strip, text="Tier 1", font=("Segoe UI", 8),
                                     bg=self.colors["card_inner"], fg=self.colors["text_muted"], relief="flat", padx=9, pady=2,
                                     cursor="hand2", command=lambda: self._set_tier_filter("1"))
        self.tier_btn_t1.pack(side="left", padx=2)

        self.tier_btn_t2 = tk.Button(tier_strip, text="Tier 2", font=("Segoe UI", 8),
                                     bg=self.colors["card_inner"], fg=self.colors["text_muted"], relief="flat", padx=9, pady=2,
                                     cursor="hand2", command=lambda: self._set_tier_filter("2"))
        self.tier_btn_t2.pack(side="left", padx=2)

        self.tier_btn_t3 = tk.Button(tier_strip, text="Tier 3", font=("Segoe UI", 8),
                                     bg=self.colors["card_inner"], fg=self.colors["text_muted"], relief="flat", padx=9, pady=2,
                                     cursor="hand2", command=lambda: self._set_tier_filter("3"))
        self.tier_btn_t3.pack(side="left", padx=2)

        # Action Buttons on Right: Start at Selected & Reset Queue
        btn_reset_statuses = tk.Button(top_bar, text="↺ Reset Queue", font=("Segoe UI", 9, "bold"),
                                       bg="#1E293B", fg=self.colors["text_muted"], activebackground="#334155",
                                       activeforeground="#FFFFFF", relief="flat", padx=12, pady=4,
                                       cursor="hand2", command=self._reset_queue_statuses)
        btn_reset_statuses.pack(side="right")

        btn_start_from = tk.Button(top_bar, text="📌 Start At Selected", font=("Segoe UI", 9, "bold"),
                                   bg="#1E293B", fg=self.colors["accent"], activebackground="#334155",
                                   activeforeground="#FFFFFF", relief="flat", padx=12, pady=4,
                                   cursor="hand2", command=self._set_selected_as_start)
        btn_start_from.pack(side="right", padx=(0, 8))

        # Bottom Live Action Ticker Frame
        ticker_frame = tk.Frame(self.queue_tab, bg=self.colors["card_inner"], padx=14, pady=7,
                                highlightbackground=self.colors["card_border"], highlightthickness=1)
        ticker_frame.pack(side="bottom", fill="x", padx=14, pady=(6, 8))

        tk.Label(ticker_frame, text="⚡ Live Action:", font=("Segoe UI", 9, "bold"),
                 fg=self.colors["accent"], bg=self.colors["card_inner"]).pack(side="left", padx=(0, 8))
        self.mini_log_lbl = tk.Label(ticker_frame, text="Ready. Press Start (F8) to begin.",
                                     font=("Segoe UI", 9), fg=self.colors["text"], bg=self.colors["card_inner"])
        self.mini_log_lbl.pack(side="left", fill="x")

        # Treeview for countries
        cols = ("idx", "name", "code", "currency", "tier", "price", "status")
        self.tree = ttk.Treeview(self.queue_tab, columns=cols, show="headings", selectmode="browse")

        self.tree.heading("idx", text="#")
        self.tree.heading("name", text="Country Name")
        self.tree.heading("code", text="ISO")
        self.tree.heading("currency", text="Currency")
        self.tree.heading("tier", text="Tier")
        self.tree.heading("price", text="Target Price")
        self.tree.heading("status", text="Status")

        self.tree.column("idx", width=45, anchor="center")
        self.tree.column("name", width=220, anchor="w")
        self.tree.column("code", width=55, anchor="center")
        self.tree.column("currency", width=75, anchor="center")
        self.tree.column("tier", width=70, anchor="center")
        self.tree.column("price", width=130, anchor="center")
        self.tree.column("status", width=140, anchor="center")

        tree_scroll = ttk.Scrollbar(self.queue_tab, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=tree_scroll.set)

        self.tree.pack(side="left", fill="both", expand=True, padx=(14, 0), pady=(0, 4))
        tree_scroll.pack(side="right", fill="y", padx=(0, 14), pady=(0, 4))

        self._populate_country_tree()

    def _set_tier_filter(self, tier_val):
        self.current_tier_filter = tier_val
        # Update button visual states
        btns = [("all", self.tier_btn_all), ("1", self.tier_btn_t1), ("2", self.tier_btn_t2), ("3", self.tier_btn_t3)]
        for val, btn in btns:
            if val == tier_val:
                btn.config(bg=self.colors["accent"], fg="#000000", font=("Segoe UI", 8, "bold"))
            else:
                btn.config(bg=self.colors["card_inner"], fg=self.colors["text_muted"], font=("Segoe UI", 8))
        self._populate_country_tree()

    def _populate_country_tree(self):
        self.tree.delete(*self.tree.get_children())
        query = self.queue_search_var.get().strip().lower()
        pricing_mode = self.pricing_mode_var.get() if hasattr(self, "pricing_mode_var") else "sale"
        tier_filter = getattr(self, "current_tier_filter", "all")

        row_count = 0
        for idx, c in enumerate(self.countries):
            name = c.get("name", "")
            code = c.get("code", "")
            curr = c.get("currency", "")
            c_tier = str(c.get("tier", 3))

            # Tier filter check
            if tier_filter != "all" and c_tier != tier_filter:
                continue

            # Query filter check
            if query and (query not in name.lower() and query not in code.lower() and query not in curr.lower()):
                continue

            # Determine price for the selected mode
            if pricing_mode == "retail":
                target_p = c.get("retail_price", 0.0)
                unit_str = f" {curr}" if curr else ""
            elif pricing_mode == "discount_pct":
                target_p = abs(c.get("discount_pct", 0.0))
                unit_str = "%"
            else:
                target_p = c.get("sale_price", c.get("retail_price", 0.0))
                unit_str = f" {curr}" if curr else ""

            if isinstance(target_p, (int, float)) and target_p > 0:
                if float(target_p).is_integer():
                    price_val = f"{int(target_p)}{unit_str}"
                elif pricing_mode == "discount_pct":
                    price_val = f"{target_p:.3f}{unit_str}"
                else:
                    price_val = f"{target_p:.2f}{unit_str}"
            elif target_p:
                price_val = f"{target_p}{unit_str}"
            else:
                price_val = "—"

            status = "○ Pending"
            tag = "pending"
            if idx < self.engine.current_country_index:
                status = "✓ Done"
                tag = "done"
            elif idx == self.engine.current_country_index and self.engine.state == AutomatorState.RUNNING:
                status = "⚡ In Progress"
                tag = "active"

            # Alternating row background for crystal clear scanning
            stripe_tag = "even" if row_count % 2 == 0 else "odd"
            row_count += 1

            self.tree.insert("", "end", iid=str(idx),
                             values=(idx + 1, name, code, curr, f"Tier {c_tier}", price_val, status),
                             tags=(tag, stripe_tag))

        self.tree.tag_configure("even", background=self.colors["tree_even"])
        self.tree.tag_configure("odd", background=self.colors["tree_odd"])
        self.tree.tag_configure("done", foreground=self.colors["success"])
        self.tree.tag_configure("matched", foreground=self.colors["accent"])
        self.tree.tag_configure("active", foreground=self.colors["warning"])
        self.tree.tag_configure("failed", foreground=self.colors["danger"])
        self.tree.tag_configure("pending", foreground=self.colors["text_muted"])

    def _filter_country_tree(self, *args):
        self._populate_country_tree()

    def _set_selected_as_start(self):
        selected = self.tree.selection()
        if selected:
            idx = int(selected[0])
            self.engine.current_country_index = idx
            self.progress_bar["value"] = idx
            self.progress_count_lbl.config(text=f"{idx} / {len(self.countries)} Countries ({idx*100//len(self.countries)}%)")
            self._populate_country_tree()
            self._on_engine_log(f"📌 Set start country to #{idx + 1}: {self.countries[idx]['name']}")

    def _reset_queue_statuses(self):
        self.engine.current_country_index = 0
        self.progress_bar["value"] = 0
        self.progress_count_lbl.config(text=f"0 / {len(self.countries)} Countries (0%)")
        self._populate_country_tree()
        self._on_engine_log("🔄 Queue reset to country #1.")

    def _build_calibration_tab(self):
        container = tk.Frame(self.calib_tab, bg=self.colors["card_bg"], padx=18, pady=12)
        container.pack(fill="both", expand=True)

        # Top Action & Status Toolbar
        top_bar = tk.Frame(container, bg=self.colors["card_bg"])
        top_bar.pack(fill="x", pady=(0, 10))

        btn_capture = tk.Button(top_bar, text="📸 Capture Live Screen & Update Crops", font=("Segoe UI", 9, "bold"),
                                bg=self.colors["success"], fg="#FFFFFF", activebackground=self.colors["success_hover"],
                                activeforeground="#FFFFFF", relief="flat", padx=14, pady=5, cursor="hand2",
                                command=self._refresh_live_calibration_crops)
        btn_capture.pack(side="left", padx=(0, 8))

        btn_autodetect = tk.Button(top_bar, text="⚡ Auto-Detect from View", font=("Segoe UI", 9, "bold"),
                                   bg=self.colors["accent"], fg="#080D1A", activebackground=self.colors["accent_hover"],
                                   activeforeground="#FFFFFF", relief="flat", padx=12, pady=5, cursor="hand2",
                                   command=self._auto_detect_visual_points)
        btn_autodetect.pack(side="left", padx=(0, 12))

        self.desktop_status_lbl = tk.Label(top_bar, text="● Live Screen: 2560x1440 • Ready",
                                           font=("Segoe UI", 9, "bold"), fg=self.colors["accent"],
                                           bg=self.colors["card_bg"])
        self.desktop_status_lbl.pack(side="left")

        desc = tk.Label(container,
                        text="Live Visual Calibration Studio: Verify that each crosshair is centered squarely on the target element below.\n"
                             "Click '🎯 Pin on Screen' to open the interactive live overlay with 4x zoom loupe to pin with single-pixel accuracy!",
                        font=("Segoe UI", 9), fg=self.colors["text_muted"], bg=self.colors["card_bg"], justify="left")
        desc.pack(anchor="w", pady=(0, 10))

        # Target Points configuration with distinct accent colors
        self.points_config = [
            ("left_search_box", "1. Country Search Box", "Google Play Console 'Search by country or region' input", "#38BDF8"),
            ("left_row_pencil", "2. Edit Pencil Icon", "Edit price pencil icon in filtered country row", "#F59E0B"),
            ("left_popup_input", "3. Popup Price Input", "Price value entry field inside the Edit Price popup dialog", "#10B981"),
            ("left_popup_cancel", "4. Popup Cancel Button", "'Cancel' button in Edit Price popup (to exit without saving)", "#F43F5E"),
            ("left_popup_save", "5. Popup Save Button", "Blue 'Save' button in Edit Price popup", "#3B82F6")
        ]

        self.coord_labels = {}
        self.crop_labels = {}
        self.crop_image_refs = {}

        grid_frame = tk.Frame(container, bg=self.colors["card_bg"])
        grid_frame.pack(fill="both", expand=True)

        coords = self.config_data.get("coordinates", {})

        for row_idx, (key, title, subtitle, color) in enumerate(self.points_config):
            row_card = tk.Frame(grid_frame, bg=self.colors["card_inner"], padx=10, pady=6,
                                highlightbackground=self.colors["card_border"], highlightthickness=1)
            row_card.pack(fill="x", pady=4)

            # 1. Live Crop Thumbnail Box (72x72)
            crop_lbl = tk.Label(row_card, bg="#060911", width=72, height=72, relief="flat",
                                highlightbackground=color, highlightthickness=1)
            crop_lbl.pack(side="left", padx=(0, 14))
            self.crop_labels[key] = (crop_lbl, color)

            # 2. Details Column
            details = tk.Frame(row_card, bg=self.colors["card_inner"])
            details.pack(side="left", fill="both", expand=True)

            tk.Label(details, text=title, font=("Segoe UI", 9, "bold"),
                     fg=self.colors["text"], bg=self.colors["card_inner"], anchor="w").pack(anchor="w")
            tk.Label(details, text=subtitle, font=("Segoe UI", 8),
                     fg=self.colors["text_dim"], bg=self.colors["card_inner"], anchor="w").pack(anchor="w", pady=(2, 0))

            # 3. Actions Column (right aligned)
            act_col = tk.Frame(row_card, bg=self.colors["card_inner"])
            act_col.pack(side="right")

            pt = coords.get(key, {"x": 0, "y": 0})
            val_col = tk.Label(act_col, text=f"X: {pt['x']}  |  Y: {pt['y']}",
                               font=("Consolas", 9, "bold"), fg=color,
                               bg=self.colors["card_bg"], padx=10, pady=3, relief="flat",
                               highlightthickness=1, highlightbackground=self.colors["card_border"])
            val_col.pack(side="left", padx=(0, 10))
            self.coord_labels[key] = val_col

            pin_btn = tk.Button(act_col, text="🎯 Pin on Screen", font=("Segoe UI", 9, "bold"),
                                bg="#1E293B", fg="#FFFFFF", activebackground="#334155",
                                activeforeground="#FFFFFF", relief="flat", padx=12, pady=4,
                                cursor="hand2", command=lambda k=key, t=title: self._launch_screen_pin(k, t))
            pin_btn.pack(side="left", padx=(0, 6))

            preview_btn = tk.Button(act_col, text="👁️ Preview", font=("Segoe UI", 9),
                                   bg=self.colors["card_inner"], fg=self.colors["accent"], activebackground="#1E293B",
                                   activeforeground="#FFFFFF", relief="flat", padx=10, pady=4,
                                   cursor="hand2", command=lambda k=key: self._preview_coordinate(k))
            preview_btn.pack(side="left")

        # Bottom Bar: Restore Defaults
        bottom_bar = tk.Frame(container, bg=self.colors["card_bg"])
        bottom_bar.pack(fill="x", pady=(10, 0))

        btn_reset = tk.Button(bottom_bar, text="↺ Restore Default Coordinates (Proportional Calibration)",
                              font=("Segoe UI", 9), bg="#1E293B", fg=self.colors["text_muted"],
                              activebackground="#334155", activeforeground="#FFFFFF",
                              relief="flat", padx=12, pady=4, cursor="hand2", command=self._restore_default_coords)
        btn_reset.pack(side="left")

    def _refresh_live_calibration_crops(self, cached_img=None):
        """Captures live screen and refreshes all thumbnail crops."""
        img = cached_img or capture_desktop_image()
        if not img:
            self._on_engine_log("⚠️ Could not capture live desktop for crop refresh.")
            return

        self.desktop_screenshot = img
        coords = self.config_data.get("coordinates", {})

        for key, (lbl, color) in self.crop_labels.items():
            pt = coords.get(key, {"x": 0, "y": 0})
            crop = generate_point_crop(img, pt.get("x", 0), pt.get("y", 0), size=72, color=color)
            photo = ImageTk.PhotoImage(crop)
            self.crop_image_refs[key] = photo
            lbl.config(image=photo)

        if hasattr(self, "desktop_status_lbl"):
            self.desktop_status_lbl.config(text=f"● Live Screen: {img.size[0]}x{img.size[1]} • Updated {time.strftime('%H:%M:%S')}")

    def _launch_screen_pin(self, key, title):
        """Launches interactive full-screen visual pin overlay with 4x zoom loupe."""
        time.sleep(0.12)
        shot = capture_desktop_image()
        if not shot:
            messagebox.showerror("Capture Error", "Could not capture desktop image for calibration.")
            return

        def on_picked(picked_key, new_pt):
            coords = self.config_data.setdefault("coordinates", {})
            coords[picked_key] = new_pt
            save_config(self.config_data)

            lbl = self.coord_labels.get(picked_key)
            if lbl:
                lbl.config(text=f"X: {new_pt['x']}  |  Y: {new_pt['y']}")

            self._refresh_live_calibration_crops(cached_img=shot)
            self._on_engine_log(f"✅ Calibrated point [{title}] to ({new_pt['x']}, {new_pt['y']})")

        ScreenPinOverlay(self, key, title, shot, on_picked)

    def _preview_coordinate(self, key):
        coords = self.config_data.get("coordinates", {})
        pt = coords.get(key)
        if pt and pt.get("x") and pt.get("y"):
            def glide():
                with self.mouse_detector.bot_movement():
                    orig_pos = pyautogui.position()
                    pyautogui.moveTo(pt["x"], pt["y"], duration=0.35)
                    time.sleep(1.2)
                    pyautogui.moveTo(orig_pos[0], orig_pos[1], duration=0.25)
            threading.Thread(target=glide, daemon=True).start()
            self._on_engine_log(f"👁️ Previewing cursor position for [{key}]: ({pt['x']}, {pt['y']})")

    def _restore_default_coords(self):
        defaults = get_default_coordinates()
        self.config_data["coordinates"] = defaults
        save_config(self.config_data)
        for key, lbl in self.coord_labels.items():
            pt = defaults.get(key, {"x": 0, "y": 0})
            lbl.config(text=f"X: {pt['x']}  |  Y: {pt['y']}")
        self._refresh_live_calibration_crops()
        self._on_engine_log("🔄 Restored default proportional coordinates.")

    def _auto_detect_visual_points(self):
        """Visually locates the Play Console search bar and table rows from live screen."""
        shot = capture_desktop_image()
        if not shot:
            messagebox.showerror("Capture Error", "Could not capture live screen for auto-detection.")
            return

        detected = {}
        s_pt = locate_search_bar_visual(shot)
        if s_pt:
            detected["left_search_box"] = {"x": s_pt[0], "y": s_pt[1]}

        p_pt = locate_first_row_pencil_visual(shot, search_bar_y=s_pt[1] if s_pt else None)
        if p_pt:
            detected["left_row_pencil"] = {"x": p_pt[0], "y": p_pt[1]}
            detected["left_popup_input"] = {"x": p_pt[0] + 5, "y": p_pt[1] + 90}
            detected["left_popup_cancel"] = {"x": p_pt[0] - 35, "y": p_pt[1] + 155}
            detected["left_popup_save"] = {"x": p_pt[0] + 30, "y": p_pt[1] + 155}

        if detected:
            coords = self.config_data.setdefault("coordinates", {})
            coords.update(detected)
            save_config(self.config_data)
            for k, pt in detected.items():
                lbl = self.coord_labels.get(k)
                if lbl:
                    lbl.config(text=f"X: {pt['x']}  |  Y: {pt['y']}")
            self._refresh_live_calibration_crops(cached_img=shot)
            self._on_engine_log(f"⚡ Auto-detected {len(detected)} points from live Play Console screen!")
        else:
            self._on_engine_log("⚠️ Could not auto-detect Play Console controls. Please ensure Google Play Console is open on the left window.")

    def _build_timing_tab(self):
        container = tk.Frame(self.timing_tab, bg=self.colors["card_bg"], padx=20, pady=16)
        container.pack(fill="both", expand=True)

        timing = self.config_data.get("timing", {})

        sliders = [
            ("pre_start_delay", "Pre-Start Countdown Delay (Seconds):", 1, 10, timing.get("pre_start_delay", 5.0),
             "Buffer period to position windows and hands after pressing Start before actions begin"),
            ("user_pause_duration", "User Mouse Pause Duration (Seconds):", 5, 20, timing.get("user_pause_duration", 10.0),
             "Safety pause duration if you move the mouse while automation is running"),
            ("search_delay", "Search Filter Wait Duration (Seconds):", 0.5, 3.0, timing.get("search_delay", 1.0),
             "Wait duration after typing country name for the Google Play Console table to filter rows"),
            ("popup_delay", "Edit Popup Animation Wait (Seconds):", 0.3, 2.5, timing.get("popup_delay", 0.8),
             "Wait duration after clicking pencil icon for the modal to animate open"),
            ("step_delay", "Inter-Country Rest Delay (Seconds):", 0.3, 3.0, timing.get("step_delay", 0.7),
             "Cooldown pause before proceeding to the next country in queue")
        ]

        self.slider_vars = {}

        for key, title, min_val, max_val, cur_val, desc in sliders:
            row = tk.Frame(container, bg=self.colors["card_inner"], padx=14, pady=10,
                           highlightbackground=self.colors["card_border"], highlightthickness=1)
            row.pack(fill="x", pady=6)

            lbl_title = tk.Label(row, text=title, font=("Segoe UI", 9, "bold"),
                                 fg=self.colors["text"], bg=self.colors["card_inner"], anchor="w")
            lbl_title.pack(anchor="w")

            lbl_desc = tk.Label(row, text=desc, font=("Segoe UI", 8),
                                fg=self.colors["text_dim"], bg=self.colors["card_inner"], anchor="w")
            lbl_desc.pack(anchor="w", pady=(2, 6))

            ctrl_row = tk.Frame(row, bg=self.colors["card_inner"])
            ctrl_row.pack(fill="x")

            var = tk.DoubleVar(value=cur_val)
            self.slider_vars[key] = var

            slider = tk.Scale(ctrl_row, from_=min_val, to=max_val, resolution=0.1, orient="horizontal",
                              variable=var, bg=self.colors["card_inner"], fg=self.colors["text"],
                              troughcolor="#1E293B", activebackground=self.colors["accent"],
                              highlightthickness=0, borderwidth=0, length=460, font=("Segoe UI", 8),
                              command=lambda val, k=key: self._on_timing_slider_change(k, val))
            slider.pack(side="left")

    def _on_timing_slider_change(self, key, val):
        timing = self.config_data.setdefault("timing", {})
        timing[key] = float(val)
        save_config(self.config_data)

    def _build_log_tab(self):
        container = tk.Frame(self.log_tab, bg=self.colors["card_bg"], padx=16, pady=12)
        container.pack(fill="both", expand=True)

        top = tk.Frame(container, bg=self.colors["card_bg"])
        top.pack(fill="x", pady=(0, 8))

        tk.Label(top, text="Execution Trace & Live Events:", font=("Segoe UI", 9, "bold"),
                 fg=self.colors["text_muted"], bg=self.colors["card_bg"]).pack(side="left")

        btn_copy = tk.Button(top, text="📋 Copy Log", font=("Segoe UI", 9, "bold"),
                             bg="#1E293B", fg=self.colors["accent"], activebackground="#334155",
                             activeforeground="#FFFFFF", relief="flat", padx=12, pady=3,
                             cursor="hand2", command=self._copy_log)
        btn_copy.pack(side="right", padx=(8, 0))

        btn_clear = tk.Button(top, text="🗑️ Clear", font=("Segoe UI", 9),
                              bg="#1E293B", fg=self.colors["text_dim"], activebackground="#334155",
                              activeforeground="#FFFFFF", relief="flat", padx=10, pady=3,
                              cursor="hand2", command=self._clear_log)
        btn_clear.pack(side="right")

        self.log_text = tk.Text(container, bg=self.colors["input_bg"], fg="#E2E8F0",
                                font=("Consolas", 10), relief="flat", borderwidth=0,
                                highlightthickness=1, highlightbackground=self.colors["input_border"],
                                wrap="word", padx=10, pady=10)
        log_scroll = ttk.Scrollbar(container, orient="vertical", command=self.log_text.yview)
        self.log_text.configure(yscrollcommand=log_scroll.set)

        self.log_text.pack(side="left", fill="both", expand=True)
        log_scroll.pack(side="right", fill="y")

    def _clear_log(self):
        self.log_text.delete("1.0", tk.END)

    def _copy_log(self):
        content = self.log_text.get("1.0", tk.END)
        self.clipboard_clear()
        self.clipboard_append(content)
        self._on_engine_log("📋 Full activity log copied to clipboard.")

    def _build_footer(self):
        ftr = tk.Frame(self, bg=self.colors["bg"], padx=20, pady=8)
        ftr.pack(fill="x", side="bottom")

        # Global Hotkey Guide
        hotkey_frame = tk.Frame(ftr, bg=self.colors["bg"])
        hotkey_frame.pack(side="left")

        tk.Label(hotkey_frame, text="Shortcuts:", font=("Segoe UI", 9, "bold"),
                 fg=self.colors["text_dim"], bg=self.colors["bg"]).pack(side="left", padx=(0, 6))

        for k, action in [("F8", "Start / Resume"), ("F9 / Esc", "Emergency Stop")]:
            k_pill = tk.Label(hotkey_frame, text=k, font=("Consolas", 8, "bold"),
                              fg=self.colors["accent"], bg="#131F37", padx=5, pady=1,
                              highlightbackground="#1E293B", highlightthickness=1)
            k_pill.pack(side="left", padx=(0, 4))
            tk.Label(hotkey_frame, text=action, font=("Segoe UI", 8),
                     fg=self.colors["text_muted"], bg=self.colors["bg"]).pack(side="left", padx=(0, 10))

        # Failsafe Indicator
        failsafe_hint = tk.Label(ftr, text="🛡️ Mouse Pause Guard Active",
                                 font=("Segoe UI", 8, "bold"), fg=self.colors["success"], bg=self.colors["bg"])
        failsafe_hint.pack(side="left", padx=(10, 0))

        # Version string
        ver = tk.Label(ftr, text=f"v{APP_VERSION} (Updated {APP_LAST_UPDATED})",
                       font=("Segoe UI", 8), fg=self.colors["text_dim"], bg=self.colors["bg"])
        ver.pack(side="right")

    def _init_hotkeys(self):
        if not HAS_PYNPUT:
            return

        def on_press(key):
            try:
                # Do NOT trigger hotkeys if keystroke was fired by the automator itself!
                if getattr(self.engine, "is_simulating", False):
                    return
                if key == pynput_keyboard.Key.f8:
                    self.after(0, self._on_click_start)
                elif key == pynput_keyboard.Key.f9:
                    self.after(0, self._on_click_stop)
                elif key == pynput_keyboard.Key.esc:
                    self.after(0, self._on_click_stop)
            except Exception:
                pass

        listener = pynput_keyboard.Listener(on_press=on_press)
        listener.daemon = True
        listener.start()

    def _periodic_window_check(self):
        """Checks for Google Play Console window on screen."""
        res = self.window_locator.check_dual_windows()
        play_found = res.get("play_console_found", False)

        if play_found:
            self.win_status_pill.config(text="● Play Console Detected • Ready",
                                        bg=self.colors["success_bg"], fg="#34D399",
                                        highlightbackground=self.colors["success_border"])
        else:
            self.win_status_pill.config(text="● Waiting for Play Console Window",
                                        bg=self.colors["card_bg"], fg=self.colors["text_muted"],
                                        highlightbackground=self.colors["card_border"])

        self.after(4000, self._periodic_window_check)

    def _timer_tick(self):
        """Periodic real-time UI update for elapsed stopwatch and estimated completion."""
        try:
            telemetry = self.engine.get_timer_telemetry()
            if hasattr(self, "timer_elapsed_lbl"):
                self.timer_elapsed_lbl.config(text=telemetry.get("elapsed_str", "00:00"))
            if hasattr(self, "timer_remaining_lbl"):
                is_comp = telemetry.get("is_completed", False)
                rem_str = telemetry.get("remaining_str", "--:--")
                col = "#10B981" if is_comp else "#F59E0B"
                self.timer_remaining_lbl.config(text=rem_str, fg=col)
        except Exception:
            pass
        finally:
            self.after(200, self._timer_tick)

    # ---------------- Engine Event Handlers ----------------

    def _on_click_start(self):
        if self.engine.state in [AutomatorState.RUNNING, AutomatorState.COUNTDOWN]:
            return
        if self.engine.current_country_index == 0:
            self.engine.stop_timers(reset=True)
        self.btn_start.config(state="disabled")
        self.btn_stop.config(state="normal")
        self.btn_test_one.config(state="disabled")
        self.engine.start(start_index=self.engine.current_country_index)

    def _on_click_stop(self):
        self.engine.stop()
        self.btn_start.config(state="normal")
        self.btn_stop.config(state="disabled")
        self.btn_test_one.config(state="normal")

    def _on_click_test_one(self):
        selected = self.tree.selection()
        idx = int(selected[0]) if selected else self.engine.current_country_index
        self.btn_start.config(state="disabled")
        self.btn_stop.config(state="normal")
        self.btn_test_one.config(state="disabled")
        self.engine.test_single_country(idx)

    def _on_engine_state_change(self, new_state, msg):
        self.after(0, lambda: self._update_state_ui(new_state, msg))

    def _update_state_ui(self, state, msg):
        if state == AutomatorState.COUNTDOWN:
            self.status_icon_lbl.config(text="🔵")
            self.status_text_lbl.config(text=f"COUNTDOWN: {msg}", fg=self.colors["accent"])
            self.btn_start.config(state="disabled")
            self.btn_stop.config(state="normal")
        elif state == AutomatorState.RUNNING:
            self.status_icon_lbl.config(text="🟢")
            self.status_text_lbl.config(text=f"RUNNING: {msg}", fg=self.colors["success"])
            self.btn_start.config(state="disabled")
            self.btn_stop.config(state="normal")
            self.btn_test_one.config(state="disabled")
        elif state == AutomatorState.PAUSED:
            self.status_icon_lbl.config(text="🟡")
            self.status_text_lbl.config(text=f"PAUSED: {msg}", fg=self.colors["warning"])
        elif state == AutomatorState.STOPPED:
            self.status_icon_lbl.config(text="🔴")
            self.status_text_lbl.config(text=f"STOPPED: {msg}", fg=self.colors["danger"])
            self.btn_start.config(state="normal")
            self.btn_stop.config(state="disabled")
            self.btn_test_one.config(state="normal")
        elif state == AutomatorState.COMPLETED:
            self.status_icon_lbl.config(text="🏁")
            self.status_text_lbl.config(text=f"COMPLETED: {msg}", fg=self.colors["success"])
            self.btn_start.config(state="normal")
            self.btn_stop.config(state="disabled")
            self.btn_test_one.config(state="normal")

        self.active_task_lbl.config(text=msg)

    def _on_engine_progress_update(self, current_idx, total, country, status, price=""):
        self.after(0, lambda: self._update_progress_ui(current_idx, total, country, status, price))

    def _update_progress_ui(self, current_idx, total, country, status, price=""):
        pct = (current_idx * 100) // total if total > 0 else 0
        self.progress_bar["value"] = current_idx
        self.progress_count_lbl.config(text=f"{current_idx} / {total} Countries ({pct}%)")

        # Update Treeview item tag
        item_id = str(current_idx if status == "processing" else max(0, current_idx - 1))
        if self.tree.exists(item_id):
            if status == "processing":
                tag = "active"
                status_text = "⚡ In Progress"
            elif status == "matched":
                tag = "matched"
                status_text = "✨ Matched"
            elif status in ["completed", "done"]:
                tag = "done"
                status_text = "✓ Done"
            else:
                tag = "failed"
                status_text = "✗ Failed"

            cur_vals = list(self.tree.item(item_id, "values"))
            if len(cur_vals) >= 7:
                if price:
                    cur_vals[5] = f"{price} {country.get('currency', '')}"
                cur_vals[6] = status_text
                self.tree.item(item_id, values=cur_vals, tags=(tag,))
                self.tree.see(item_id)

    def _on_engine_pause_tick(self, rem_sec):
        self.after(0, lambda: self.status_text_lbl.config(
            text=f"PAUSED: User mouse movement detected! Resuming in {rem_sec:.1f}s...",
            fg=self.colors["warning"]
        ))

    def _on_engine_log(self, message):
        self.after(0, lambda: self._append_log(message))

    def _append_log(self, message):
        ts = time.strftime("%H:%M:%S")
        self.log_text.insert(tk.END, f"[{ts}] {message}\n")
        self.log_text.see(tk.END)
        if hasattr(self, "mini_log_lbl"):
            self.mini_log_lbl.config(text=f"[{ts}] {message}")


if __name__ == "__main__":
    app = PlaySaleAutomatorGUI()
    app.mainloop()
