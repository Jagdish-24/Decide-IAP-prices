"""
GUI Interface for Google Play Sale Price Automator.
Features modern dark mode aesthetic, live progress tracking, country selector queue,
point calibration helpers, and global hotkeys (F8 start / F9 stop).
"""

import os
import json
import time
import threading
import tkinter as tk
from tkinter import ttk, messagebox, filedialog
import pyautogui

from config import load_config, save_config, get_default_coordinates
from mouse_detector import MouseInterventionDetector
from automator_engine import PlaySaleAutomatorEngine, AutomatorState
from window_locator import WindowLocator
from file_parser import parse_pricing_file

# Attempt global hotkeys with pynput
try:
    from pynput import keyboard as pynput_keyboard
    HAS_PYNPUT = True
except ImportError:
    HAS_PYNPUT = False

class PlaySaleAutomatorGUI(tk.Tk):
    def __init__(self):
        super().__init__()

        self.title("Play Sale Price Automator • Google Play Console Robot")
        self.geometry("1040x780")
        self.minsize(880, 640)
        self.configure(bg="#0B0F19")

        # Load data and configuration
        self.config_data = load_config()
        self.countries = self._load_countries()
        self.loaded_file_name = "default_pricing_matrix.csv"
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
        self._build_mode_bar()
        self._build_status_card()
        self._build_tabs()
        self._build_footer()

        # Setup Global Hotkeys
        self._init_hotkeys()

        # Start periodic GUI clock for window check
        self.after(1000, self._periodic_window_check)

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
            "bg": "#0B0F19",
            "card_bg": "#131B2E",
            "card_border": "#1E293B",
            "accent": "#38BDF8",
            "accent_hover": "#0284C7",
            "success": "#22C55E",
            "success_hover": "#16A34A",
            "danger": "#EF4444",
            "danger_hover": "#DC2626",
            "warning": "#F59E0B",
            "text": "#F8FAFC",
            "text_muted": "#94A3B8",
            "input_bg": "#0F172A",
            "input_border": "#334155"
        }

        style = ttk.Style(self)
        style.theme_use("clam")

        # Custom Notebook Tabs
        style.configure("TNotebook", background=self.colors["bg"], borderwidth=0)
        style.configure("TNotebook.Tab", background=self.colors["card_bg"],
                        foreground=self.colors["text_muted"], padding=[16, 8],
                        font=("Segoe UI", 10, "bold"), borderwidth=0)
        style.map("TNotebook.Tab",
                  background=[("selected", self.colors["card_border"]), ("active", "#1E293B")],
                  foreground=[("selected", self.colors["accent"]), ("active", self.colors["text"])])

        # Custom Treeview
        style.configure("Treeview", background=self.colors["input_bg"],
                        foreground=self.colors["text"], fieldbackground=self.colors["input_bg"],
                        font=("Segoe UI", 9), rowheight=26, borderwidth=0)
        style.configure("Treeview.Heading", background=self.colors["card_bg"],
                        foreground=self.colors["accent"], font=("Segoe UI", 9, "bold"), borderwidth=0)
        style.map("Treeview", background=[("selected", "#1E3A5F")], foreground=[("selected", "#FFFFFF")])

        # Progress bar
        style.configure("Horizontal.TProgressbar", background=self.colors["accent"],
                        troughcolor=self.colors["input_bg"], borderwidth=0)

    def _build_header(self):
        hdr = tk.Frame(self, bg=self.colors["bg"], padx=20, pady=14)
        hdr.pack(fill="x")

        left = tk.Frame(hdr, bg=self.colors["bg"])
        left.pack(side="left")

        title_lbl = tk.Label(left, text="Play Sale Price Automator",
                             font=("Segoe UI", 16, "bold"), fg=self.colors["text"], bg=self.colors["bg"])
        title_lbl.pack(anchor="w")

        sub_lbl = tk.Label(left, text="Automated Pricing Robot for Google Play Console",
                           font=("Segoe UI", 9), fg=self.colors["text_muted"], bg=self.colors["bg"])
        sub_lbl.pack(anchor="w")

        # Window detection pill
        self.win_status_pill = tk.Label(hdr, text="⚡ Single Window Active (Play Console Only)",
                                        font=("Segoe UI", 9, "bold"), bg="#064E3B", fg="#34D399",
                                        padx=12, pady=5)
        self.win_status_pill.pack(side="right")

    def _build_mode_bar(self):
        bar = tk.Frame(self, bg="#131B2E", padx=16, pady=9,
                       highlightbackground=self.colors["card_border"], highlightthickness=1)
        bar.pack(fill="x", padx=20, pady=(0, 12))

        # Mode Selection: 2. Set App Sale Prices vs 1. Set App Prices
        tk.Label(bar, text="Task Mode:", font=("Segoe UI", 9, "bold"),
                 fg=self.colors["accent"], bg="#131B2E").pack(side="left", padx=(0, 8))

        self.pricing_mode_var = tk.StringVar(value=self.config_data.get("pricing_target_mode", "sale"))

        rb_sale = tk.Radiobutton(bar, text="Mode 2: Set App Sale Prices (Promotional)",
                                 variable=self.pricing_mode_var, value="sale",
                                 font=("Segoe UI", 9, "bold"), fg=self.colors["text"],
                                 bg="#131B2E", selectcolor="#0F172A", activebackground="#131B2E",
                                 activeforeground=self.colors["accent"],
                                 command=self._on_change_pricing_mode)
        rb_sale.pack(side="left", padx=(0, 10))

        rb_retail = tk.Radiobutton(bar, text="Mode 1: Set App Prices (Regular Base)",
                                   variable=self.pricing_mode_var, value="retail",
                                   font=("Segoe UI", 9), fg=self.colors["text_muted"],
                                   bg="#131B2E", selectcolor="#0F172A", activebackground="#131B2E",
                                   activeforeground=self.colors["accent"],
                                   command=self._on_change_pricing_mode)
        rb_retail.pack(side="left", padx=(0, 18))

        # Automation Scope: 1-Window vs 2-Windows
        self.window_mode_var = tk.StringVar(value=self.config_data.get("automation_mode", "single_window"))

        rb_single = tk.Radiobutton(bar, text="⚡ 1-Window (Play Console Only)",
                                   variable=self.window_mode_var, value="single_window",
                                   font=("Segoe UI", 9, "bold"), fg=self.colors["success"],
                                   bg="#131B2E", selectcolor="#0F172A", activebackground="#131B2E",
                                   activeforeground=self.colors["success"],
                                   command=self._on_change_window_mode)
        rb_single.pack(side="left", padx=(0, 8))

        rb_dual = tk.Radiobutton(bar, text="🔄 2-Windows (Screen Copy)",
                                 variable=self.window_mode_var, value="dual_window",
                                 font=("Segoe UI", 9), fg=self.colors["text_muted"],
                                 bg="#131B2E", selectcolor="#0F172A", activebackground="#131B2E",
                                 activeforeground=self.colors["text"],
                                 command=self._on_change_window_mode)
        rb_dual.pack(side="left", padx=(0, 16))

        # File load button on the right
        btn_load = tk.Button(bar, text="📁 Load File (CSV/JSON)", font=("Segoe UI", 9, "bold"),
                             bg="#334155", fg=self.colors["text"], activebackground="#475569",
                             activeforeground="#FFFFFF", relief="flat", padx=10, pady=3,
                             cursor="hand2", command=self._on_click_load_file)
        btn_load.pack(side="right", padx=(8, 0))

        self.loaded_file_lbl = tk.Label(bar, text=f"File: {self.loaded_file_name}",
                                        font=("Segoe UI", 8), fg=self.colors["text_muted"], bg="#131B2E")
        self.loaded_file_lbl.pack(side="right")

    def _on_change_pricing_mode(self):
        mode = self.pricing_mode_var.get()
        self.config_data["pricing_target_mode"] = mode
        save_config(self.config_data)
        self._populate_country_tree()
        label = "Mode 2: Set App Sale Prices" if mode == "sale" else "Mode 1: Set App Regular Prices"
        self._on_engine_log(f"🔄 Switched to {label}")

    def _on_change_window_mode(self):
        w_mode = self.window_mode_var.get()
        self.config_data["automation_mode"] = w_mode
        save_config(self.config_data)
        if w_mode == "single_window":
            self.win_status_pill.config(text="⚡ Single Window Active (Play Console Only)",
                                        bg="#064E3B", fg="#34D399")
            self._on_engine_log("⚡ Single Window Mode enabled: Bot only interacts with Google Play Console (Reading target prices from file)!")
        else:
            self.win_status_pill.config(text="🔄 Dual Window Mode (Play Console + PlayPrice)",
                                        bg="#1E293B", fg="#94A3B8")
            self._on_engine_log("🔄 Dual Window Mode enabled: Bot will copy prices from right window to left window.")

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
            if "sale" in fn_lower and hasattr(self, "pricing_mode_var"):
                self.pricing_mode_var.set("sale")
            elif ("app_price" in fn_lower or "retail" in fn_lower) and hasattr(self, "pricing_mode_var"):
                self.pricing_mode_var.set("retail")

            if hasattr(self, "loaded_file_lbl"):
                self.loaded_file_lbl.config(text=f"File: {self.loaded_file_name}")
            self._populate_country_tree()
            self._on_engine_log(f"✅ Successfully loaded {len(parsed)} prices from: {self.loaded_file_name}")
            messagebox.showinfo("File Loaded", f"Successfully loaded pricing matrix from {self.loaded_file_name} ({len(parsed)} countries)")
        except Exception as e:
            messagebox.showerror("Error Loading File", f"Could not parse file:\n{e}")

    def _build_status_card(self):
        card = tk.Frame(self, bg=self.colors["card_bg"], padx=18, pady=14,
                        highlightbackground=self.colors["card_border"], highlightthickness=1)
        card.pack(fill="x", padx=20, pady=(0, 12))

        # Status text row
        top_row = tk.Frame(card, bg=self.colors["card_bg"])
        top_row.pack(fill="x", pady=(0, 8))

        self.status_icon_lbl = tk.Label(top_row, text="⚪", font=("Segoe UI", 14),
                                        bg=self.colors["card_bg"], fg=self.colors["text_muted"])
        self.status_icon_lbl.pack(side="left", padx=(0, 6))

        self.status_text_lbl = tk.Label(top_row, text="IDLE — Press Start (F8) to begin automation",
                                        font=("Segoe UI", 11, "bold"), bg=self.colors["card_bg"],
                                        fg=self.colors["text"])
        self.status_text_lbl.pack(side="left")

        self.progress_count_lbl = tk.Label(top_row, text="0 / 176 Countries (0%)",
                                          font=("Segoe UI", 10, "bold"), bg=self.colors["card_bg"],
                                          fg=self.colors["accent"])
        self.progress_count_lbl.pack(side="right")

        # Progress bar
        self.progress_bar = ttk.Progressbar(card, style="Horizontal.TProgressbar",
                                           orient="horizontal", mode="determinate", maximum=len(self.countries))
        self.progress_bar.pack(fill="x", pady=(0, 10))

        # Control buttons row
        btn_row = tk.Frame(card, bg=self.colors["card_bg"])
        btn_row.pack(fill="x")

        self.btn_start = tk.Button(btn_row, text="▶ START (F8)", font=("Segoe UI", 11, "bold"),
                                   bg=self.colors["success"], fg="#FFFFFF", activebackground=self.colors["success_hover"],
                                   activeforeground="#FFFFFF", relief="flat", padx=24, pady=8,
                                   cursor="hand2", command=self._on_click_start)
        self.btn_start.pack(side="left", padx=(0, 10))

        self.btn_stop = tk.Button(btn_row, text="■ STOP (F9 / Esc)", font=("Segoe UI", 11, "bold"),
                                  bg=self.colors["danger"], fg="#FFFFFF", activebackground=self.colors["danger_hover"],
                                  activeforeground="#FFFFFF", relief="flat", padx=20, pady=8,
                                  cursor="hand2", command=self._on_click_stop, state="disabled")
        self.btn_stop.pack(side="left", padx=(0, 10))

        self.btn_test_one = tk.Button(btn_row, text="🧪 Test 1 Country", font=("Segoe UI", 10, "bold"),
                                      bg="#334155", fg=self.colors["text"], activebackground="#475569",
                                      activeforeground="#FFFFFF", relief="flat", padx=16, pady=8,
                                      cursor="hand2", command=self._on_click_test_one)
        self.btn_test_one.pack(side="left")

        # Current action indicator
        self.active_task_lbl = tk.Label(btn_row, text="Ready", font=("Segoe UI", 9, "italic"),
                                        bg=self.colors["card_bg"], fg=self.colors["text_muted"])
        self.active_task_lbl.pack(side="right", padx=8)

    def _build_tabs(self):
        tab_frame = tk.Frame(self, bg=self.colors["bg"])
        tab_frame.pack(fill="both", expand=True, padx=20, pady=(0, 10))

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
        self.notebook.add(self.timing_tab, text="  ⚙️ Timings & Delays  ")
        self._build_timing_tab()

        # Tab 4: Activity Log
        self.log_tab = tk.Frame(self.notebook, bg=self.colors["card_bg"])
        self.notebook.add(self.log_tab, text="  📝 Activity Log  ")
        self._build_log_tab()

    def _build_queue_tab(self):
        top_bar = tk.Frame(self.queue_tab, bg=self.colors["card_bg"], padx=14, pady=10)
        top_bar.pack(fill="x")

        tk.Label(top_bar, text="Filter:", font=("Segoe UI", 9, "bold"),
                 fg=self.colors["text_muted"], bg=self.colors["card_bg"]).pack(side="left", padx=(0, 6))

        self.queue_search_var = tk.StringVar()
        self.queue_search_var.trace("w", self._filter_country_tree)
        search_entry = tk.Entry(top_bar, textvariable=self.queue_search_var, font=("Segoe UI", 9),
                                bg=self.colors["input_bg"], fg=self.colors["text"],
                                insertbackground=self.colors["text"], width=28, relief="flat",
                                highlightthickness=1, highlightbackground=self.colors["input_border"])
        search_entry.pack(side="left", padx=(0, 14), ipady=3)

        btn_start_from = tk.Button(top_bar, text="Set Start Point at Selected", font=("Segoe UI", 9, "bold"),
                                   bg="#334155", fg=self.colors["text"], relief="flat", padx=12, pady=4,
                                   cursor="hand2", command=self._set_selected_as_start)
        btn_start_from.pack(side="left", padx=4)

        btn_reset_statuses = tk.Button(top_bar, text="Reset Queue", font=("Segoe UI", 9),
                                       bg="#1E293B", fg=self.colors["text_muted"], relief="flat", padx=10, pady=4,
                                       cursor="hand2", command=self._reset_queue_statuses)
        btn_reset_statuses.pack(side="right")

        # Bottom Live Action Ticker
        ticker_frame = tk.Frame(self.queue_tab, bg="#0F172A", padx=12, pady=6,
                                highlightbackground=self.colors["card_border"], highlightthickness=1)
        ticker_frame.pack(side="bottom", fill="x", padx=14, pady=(6, 10))

        tk.Label(ticker_frame, text="⚡ Live Action:", font=("Segoe UI", 8, "bold"),
                 fg=self.colors["accent"], bg="#0F172A").pack(side="left", padx=(0, 8))
        self.mini_log_lbl = tk.Label(ticker_frame, text="Ready. Press Start (F8) to begin.",
                                     font=("Segoe UI", 9), fg=self.colors["text"], bg="#0F172A")
        self.mini_log_lbl.pack(side="left", fill="x")

        # Treeview for countries
        cols = ("idx", "name", "code", "currency", "tier", "price", "status")
        self.tree = ttk.Treeview(self.queue_tab, columns=cols, show="headings", selectmode="browse")

        self.tree.heading("idx", text="#")
        self.tree.heading("name", text="Country Name")
        self.tree.heading("code", text="ISO")
        self.tree.heading("currency", text="Currency")
        self.tree.heading("tier", text="Tier")
        self.tree.heading("price", text="Price Set")
        self.tree.heading("status", text="Status")

        self.tree.column("idx", width=45, anchor="center")
        self.tree.column("name", width=230, anchor="w")
        self.tree.column("code", width=55, anchor="center")
        self.tree.column("currency", width=80, anchor="center")
        self.tree.column("tier", width=60, anchor="center")
        self.tree.column("price", width=110, anchor="center")
        self.tree.column("status", width=120, anchor="center")

        tree_scroll = ttk.Scrollbar(self.queue_tab, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=tree_scroll.set)

        self.tree.pack(side="left", fill="both", expand=True, padx=(14, 0), pady=(0, 6))
        tree_scroll.pack(side="right", fill="y", padx=(0, 14), pady=(0, 6))

        self._populate_country_tree()

    def _populate_country_tree(self):
        self.tree.delete(*self.tree.get_children())
        query = self.queue_search_var.get().strip().lower()
        pricing_mode = self.pricing_mode_var.get() if hasattr(self, "pricing_mode_var") else "sale"

        for idx, c in enumerate(self.countries):
            name = c.get("name", "")
            code = c.get("code", "")
            curr = c.get("currency", "")
            if query and (query not in name.lower() and query not in code.lower() and query not in curr.lower()):
                continue

            # Determine price for the selected mode
            if pricing_mode == "retail":
                target_p = c.get("retail_price", 0.0)
            else:
                target_p = c.get("sale_price", c.get("retail_price", 0.0))

            if isinstance(target_p, (int, float)) and target_p > 0:
                if float(target_p).is_integer():
                    price_val = f"{int(target_p)} {curr}"
                else:
                    price_val = f"{target_p:.2f} {curr}"
            elif target_p:
                price_val = f"{target_p} {curr}"
            else:
                price_val = "—"

            status = "Pending"
            if idx < self.engine.current_country_index:
                status = "✅ Done"
            elif idx == self.engine.current_country_index and self.engine.state == AutomatorState.RUNNING:
                status = "⏳ In Progress"

            tag = "done" if "Done" in status else ("active" if "Progress" in status else "pending")
            self.tree.insert("", "end", iid=str(idx),
                             values=(idx + 1, name, code, curr, f"Tier {c.get('tier', 3)}", price_val, status),
                             tags=(tag,))

        self.tree.tag_configure("done", foreground=self.colors["success"])
        self.tree.tag_configure("active", foreground=self.colors["accent"])
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
        container = tk.Frame(self.calib_tab, bg=self.colors["card_bg"], padx=18, pady=16)
        container.pack(fill="both", expand=True)

        desc = tk.Label(container,
                        text="Click 'Pick' on any point to capture its exact pixel coordinates on your monitor.\n"
                             "A 3-second countdown will start: simply hover your mouse over the element until captured!",
                        font=("Segoe UI", 9), fg=self.colors["text_muted"], bg=self.colors["card_bg"], justify="left")
        desc.pack(anchor="w", pady=(0, 14))

        points = [
            ("right_search_box", "1. Right Window Search Box", "Filter countries search box in PlayPriceEngine"),
            ("right_copy_button", "2. Right Window Copy Button", "Copy button next to the discounted price in first row"),
            ("left_search_box", "3. Left Window Search Box", "'Search by country or region' input in Play Console"),
            ("left_row_pencil", "4. Left Window Pencil Icon", "Edit pencil icon in the filtered country table row"),
            ("left_popup_input", "5. Left Window Popup Input", "Price entry input box inside the Edit Price popup"),
            ("left_popup_cancel", "6. Left Window Popup Cancel", "'Cancel' button in Edit Price popup"),
            ("left_popup_save", "7. Left Window Popup Save Button", "Blue 'Save' button in Edit Price popup")
        ]

        self.coord_labels = {}

        grid_frame = tk.Frame(container, bg=self.colors["card_bg"])
        grid_frame.pack(fill="x")

        coords = self.config_data.get("coordinates", {})

        for row_idx, (key, title, subtitle) in enumerate(points):
            pt = coords.get(key, {"x": 0, "y": 0})

            title_col = tk.Label(grid_frame, text=title, font=("Segoe UI", 9, "bold"),
                                 fg=self.colors["text"], bg=self.colors["card_bg"], anchor="w")
            title_col.grid(row=row_idx, column=0, sticky="w", pady=6, padx=(0, 16))

            sub_col = tk.Label(grid_frame, text=subtitle, font=("Segoe UI", 8),
                               fg=self.colors["text_muted"], bg=self.colors["card_bg"], anchor="w")
            sub_col.grid(row=row_idx, column=1, sticky="w", pady=6, padx=(0, 20))

            val_col = tk.Label(grid_frame, text=f"X: {pt['x']}  |  Y: {pt['y']}",
                               font=("Consolas", 10, "bold"), fg=self.colors["accent"],
                               bg=self.colors["input_bg"], padx=10, pady=3, relief="flat")
            val_col.grid(row=row_idx, column=2, sticky="e", pady=6, padx=(0, 10))
            self.coord_labels[key] = val_col

            pick_btn = tk.Button(grid_frame, text="🎯 Pick", font=("Segoe UI", 9, "bold"),
                                 bg="#334155", fg=self.colors["text"], activebackground="#475569",
                                 activeforeground="#FFFFFF", relief="flat", padx=12, pady=2,
                                 cursor="hand2", command=lambda k=key, t=title: self._pick_coordinate(k, t))
            pick_btn.grid(row=row_idx, column=3, pady=6)

        # Reset button
        btn_reset = tk.Button(container, text="Restore Default Coordinates (2560x1440 Proportional)",
                              font=("Segoe UI", 9), bg="#1E293B", fg=self.colors["text_muted"],
                              relief="flat", padx=14, pady=6, cursor="hand2", command=self._restore_default_coords)
        btn_reset.pack(anchor="w", pady=(16, 0))

    def _pick_coordinate(self, key, title):
        def worker():
            captured = WindowLocator.capture_point_with_countdown(
                title, countdown_sec=3, on_tick=lambda msg: self._on_engine_log(f"🎯 {msg}")
            )
            coords = self.config_data.setdefault("coordinates", {})
            coords[key] = captured
            save_config(self.config_data)

            lbl = self.coord_labels.get(key)
            if lbl:
                lbl.config(text=f"X: {captured['x']}  |  Y: {captured['y']}")
            self._on_engine_log(f"✅ Saved coordinate for [{title}]: {captured}")

        threading.Thread(target=worker, daemon=True).start()

    def _restore_default_coords(self):
        defaults = get_default_coordinates()
        self.config_data["coordinates"] = defaults
        save_config(self.config_data)
        for key, lbl in self.coord_labels.items():
            pt = defaults.get(key, {"x": 0, "y": 0})
            lbl.config(text=f"X: {pt['x']}  |  Y: {pt['y']}")
        self._on_engine_log("🔄 Restored default proportional coordinates.")

    def _build_timing_tab(self):
        container = tk.Frame(self.timing_tab, bg=self.colors["card_bg"], padx=18, pady=16)
        container.pack(fill="both", expand=True)

        timing = self.config_data.get("timing", {})

        sliders = [
            ("pre_start_delay", "Pre-Start Delay Countdown (Seconds):", 1, 10, timing.get("pre_start_delay", 5.0),
             "Time you have to position hands and focus windows after clicking Start"),
            ("user_pause_duration", "User Mouse Pause Duration (Seconds):", 5, 20, timing.get("user_pause_duration", 10.0),
             "Pause duration if you physically move the mouse while the bot is active"),
            ("search_delay", "Table Search Filter Wait (Seconds):", 0.5, 3.0, timing.get("search_delay", 1.0),
             "Wait time after typing country name for Google Play Console table to filter"),
            ("popup_delay", "Edit Price Popup Wait (Seconds):", 0.3, 2.5, timing.get("popup_delay", 0.8),
             "Wait time for the pencil click popup to animate open"),
            ("step_delay", "Delay Between Countries (Seconds):", 0.3, 3.0, timing.get("step_delay", 0.7),
             "Rest delay before proceeding to the next country")
        ]

        self.slider_vars = {}

        for key, title, min_val, max_val, cur_val, desc in sliders:
            row = tk.Frame(container, bg=self.colors["card_bg"])
            row.pack(fill="x", pady=8)

            lbl_title = tk.Label(row, text=title, font=("Segoe UI", 9, "bold"),
                                 fg=self.colors["text"], bg=self.colors["card_bg"], anchor="w")
            lbl_title.pack(anchor="w")

            lbl_desc = tk.Label(row, text=desc, font=("Segoe UI", 8),
                                fg=self.colors["text_muted"], bg=self.colors["card_bg"], anchor="w")
            lbl_desc.pack(anchor="w", pady=(0, 4))

            ctrl_row = tk.Frame(row, bg=self.colors["card_bg"])
            ctrl_row.pack(fill="x")

            var = tk.DoubleVar(value=cur_val)
            self.slider_vars[key] = var

            slider = tk.Scale(ctrl_row, from_=min_val, to=max_val, resolution=0.1, orient="horizontal",
                              variable=var, bg=self.colors["input_bg"], fg=self.colors["text"],
                              troughcolor=self.colors["card_border"], activebackground=self.colors["accent"],
                              highlightthickness=0, borderwidth=0, length=400,
                              command=lambda val, k=key: self._on_timing_slider_change(k, val))
            slider.pack(side="left")

    def _on_timing_slider_change(self, key, val):
        timing = self.config_data.setdefault("timing", {})
        timing[key] = float(val)
        save_config(self.config_data)

    def _build_log_tab(self):
        container = tk.Frame(self.log_tab, bg=self.colors["card_bg"], padx=14, pady=12)
        container.pack(fill="both", expand=True)

        top = tk.Frame(container, bg=self.colors["card_bg"])
        top.pack(fill="x", pady=(0, 6))

        tk.Label(top, text="Execution Trace & Live Events:", font=("Segoe UI", 9, "bold"),
                 fg=self.colors["text_muted"], bg=self.colors["card_bg"]).pack(side="left")

        btn_clear = tk.Button(top, text="Clear Log", font=("Segoe UI", 8),
                              bg="#1E293B", fg=self.colors["text_muted"], relief="flat", padx=8, pady=2,
                              cursor="hand2", command=self._clear_log)
        btn_clear.pack(side="right")

        self.log_text = tk.Text(container, bg=self.colors["input_bg"], fg="#E2E8F0",
                                font=("Consolas", 9), relief="flat", borderwidth=0,
                                highlightthickness=1, highlightbackground=self.colors["input_border"],
                                wrap="word")
        log_scroll = ttk.Scrollbar(container, orient="vertical", command=self.log_text.yview)
        self.log_text.configure(yscrollcommand=log_scroll.set)

        self.log_text.pack(side="left", fill="both", expand=True)
        log_scroll.pack(side="right", fill="y")

    def _clear_log(self):
        self.log_text.delete("1.0", tk.END)

    def _build_footer(self):
        ftr = tk.Frame(self, bg=self.colors["bg"], padx=20, pady=8)
        ftr.pack(fill="x", side="bottom")

        hotkey_hint = tk.Label(ftr, text="Global Hotkeys: F8 = Start / Resume  •  F9 / Esc = Emergency Stop",
                               font=("Segoe UI", 9, "bold"), fg=self.colors["text_muted"], bg=self.colors["bg"])
        hotkey_hint.pack(side="left")

        ver = tk.Label(ftr, text="v1.0 • Fail-safe Mouse Pause Active",
                       font=("Segoe UI", 8), fg="#64748B", bg=self.colors["bg"])
        ver.pack(side="right")

    def _init_hotkeys(self):
        if not HAS_PYNPUT:
            return

        def on_press(key):
            try:
                if key == pynput_keyboard.Key.f8:
                    self.after(0, self._on_click_start)
                elif key == pynput_keyboard.Key.f9 or key == pynput_keyboard.Key.esc:
                    self.after(0, self._on_click_stop)
            except Exception:
                pass

        listener = pynput_keyboard.Listener(on_press=on_press)
        listener.daemon = True
        listener.start()

    def _periodic_window_check(self):
        """Checks for Google Play Console and PlayPriceEngine windows."""
        res = self.window_locator.check_dual_windows()
        play_found = res["play_console_found"]
        engine_found = res["engine_found"]

        w_mode = self.window_mode_var.get() if hasattr(self, "window_mode_var") else "single_window"

        if w_mode == "single_window":
            if play_found:
                self.win_status_pill.config(text="🟢 Play Console Detected • Ready (1-Window)",
                                            bg="#064E3B", fg="#34D399")
            else:
                self.win_status_pill.config(text="⚡ 1-Window Mode (Focus Play Console on screen)",
                                            bg="#0F172A", fg="#38BDF8")
        else:
            if play_found and engine_found:
                self.win_status_pill.config(text="🟢 Dual Windows Ready (Play Console + PlayPrice)",
                                            bg="#064E3B", fg="#34D399")
            elif play_found:
                self.win_status_pill.config(text="🟡 Play Console Detected (Open PlayPrice on right)",
                                            bg="#451A03", fg="#FBBF24")
            elif engine_found:
                self.win_status_pill.config(text="🟡 PlayPrice Detected (Open Play Console on left)",
                                            bg="#451A03", fg="#FBBF24")
            else:
                self.win_status_pill.config(text="⚪ Dual Windows Active (Left: Play Console | Right: PlayPrice)",
                                            bg="#1E293B", fg="#94A3B8")

        self.after(4000, self._periodic_window_check)

    # ---------------- Engine Event Handlers ----------------

    def _on_click_start(self):
        if self.engine.state in [AutomatorState.RUNNING, AutomatorState.COUNTDOWN]:
            return
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
            self.status_text_lbl.config(text="COMPLETED: All countries processed!", fg=self.colors["success"])
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
            tag = "active" if status == "processing" else ("done" if status == "completed" else "failed")
            status_text = "⏳ In Progress" if status == "processing" else ("✅ Done" if status == "completed" else "❌ Failed")
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
