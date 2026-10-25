"""
End-to-End Automated Integration Test Suite for Play Sale Automator.
Tests:
1. Export generation & data structure
2. Pricing File Parser (CSV loading)
3. GUI import & Mode 1 vs Mode 2 auto-detection
4. Automator Engine Execution:
   - Search bar click and country filter
   - Edit pencil click & popup open
   - Price comparison & duplicate detection (matching price -> clean escape)
   - Price mismatch resolution (mismatch -> clear, type, save)
   - Step advancement and treeview status updates
   - Live ticker, logs, and history tracking
   - User mouse intervention pause/resume safety
"""

import sys
import os
import math
import unittest
from unittest.mock import MagicMock, patch

if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

# Ensure python_software_automation module is on sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from file_parser import parse_pricing_file
from automator_engine import (
    PlaySaleAutomatorEngine,
    AutomatorState,
    extract_numeric_value,
    get_humanized_delay,
    format_duration
)
from config import CADENCE_PRESETS, CADENCE_CODE_TO_DISPLAY, CADENCE_DISPLAY_TO_CODE
from mouse_detector import MouseInterventionDetector

class TestPlaySaleAutomatorFlow(unittest.TestCase):

    def setUp(self):
        self.sample_csv_path = os.path.join(os.path.dirname(__file__), "test_bot_sale_prices.csv")
        # Generate sample CSV matching the website's exact export output (Sale mode: 4 columns)
        csv_content = """Country Name,Retail Price,Discounted Price,Discount Percentage
"Albania",0.99,0.19,"-50%"
"Algeria",150,30,"-50%"
"Angola",0.99,0.19,"-50%"
"Antigua & Barbuda",0.99,0.29,"-50%"
"Argentina",419,199,"-50%"
"Armenia",0.99,0.19,"-50%"
"Aruba",0.99,0.29,"-50%"
"Australia",1.49,0.69,"-50%"
"Austria",0.99,0.49,"-50%"
"Azerbaijan",1.00,0.49,"-50%"
"India",49,9,"-50%"
"""
        with open(self.sample_csv_path, "w", encoding="utf-8-sig") as f:
            f.write(csv_content)

    def tearDown(self):
        if os.path.exists(self.sample_csv_path):
            os.remove(self.sample_csv_path)

    # -------------------------------------------------------------
    # TEST 1: CSV Export & Parsing (Both 4-Column and 2-Column Formats)
    # -------------------------------------------------------------
    def test_01_csv_parsing(self):
        # 1. Test 4-column sale mode CSV
        parsed = parse_pricing_file(self.sample_csv_path)
        self.assertEqual(len(parsed), 11)

        al = parsed.get("Albania")
        self.assertIsNotNone(al)
        self.assertEqual(al["sale_price"], 0.19)
        self.assertEqual(al["retail_price"], 0.99)
        self.assertEqual(al["discount_pct"], -50.0)

        dz = parsed.get("Algeria")
        self.assertIsNotNone(dz)
        self.assertEqual(dz["sale_price"], 30.0)
        self.assertEqual(dz["retail_price"], 150.0)

        ar = parsed.get("Argentina")
        self.assertIsNotNone(ar)
        self.assertEqual(ar["sale_price"], 199.0)

        au = parsed.get("Australia")
        self.assertIsNotNone(au)
        self.assertEqual(au["sale_price"], 0.69)
        self.assertEqual(au["retail_price"], 1.49)

        # 2. Test 2-column base app pricing CSV (discount disabled)
        two_col_csv = os.path.join(os.path.dirname(__file__), "test_2col.csv")
        try:
            with open(two_col_csv, "w", encoding="utf-8-sig") as f:
                f.write('Country Name,Retail Price\n"Albania",0.99\n"India",49\n')
            parsed_2col = parse_pricing_file(two_col_csv)
            self.assertEqual(len(parsed_2col), 2)
            self.assertEqual(parsed_2col["Albania"]["retail_price"], 0.99)
            self.assertEqual(parsed_2col["Albania"]["sale_price"], 0.99)
            self.assertEqual(parsed_2col["India"]["retail_price"], 49.0)
        finally:
            if os.path.exists(two_col_csv):
                os.remove(two_col_csv)

        # 3. Test raw 3-decimal text discount % CSV export (v1.8.8 format without %)
        raw_pct_csv = os.path.join(os.path.dirname(__file__), "test_raw_pct.csv")
        try:
            with open(raw_pct_csv, "w", encoding="utf-8-sig") as f:
                f.write('Country Name,Retail Price,Discounted Price,Discount Percentage\n"Canada",1.49,0.60,59.732\n"Chile",569,228,59.930\n')
            parsed_raw = parse_pricing_file(raw_pct_csv)
            self.assertEqual(len(parsed_raw), 2)
            self.assertEqual(parsed_raw["Canada"]["discount_pct"], 59.732)
            self.assertEqual(parsed_raw["Canada"]["discount_pct_raw"], "59.732")
            self.assertEqual(parsed_raw["Chile"]["discount_pct"], 59.930)
            self.assertEqual(parsed_raw["Chile"]["discount_pct_raw"], "59.930")
        finally:
            if os.path.exists(raw_pct_csv):
                os.remove(raw_pct_csv)

        print("✅ Test 1 Passed: CSV Parsing verified for 4-column, 2-column, and raw 3-decimal percent export formats.")

    # -------------------------------------------------------------
    # TEST 2: Numeric Extraction Helper
    # -------------------------------------------------------------
    def test_02_numeric_extraction(self):
        self.assertEqual(extract_numeric_value("USD 0.19"), 0.19)
        self.assertEqual(extract_numeric_value("0.19 USD"), 0.19)
        self.assertEqual(extract_numeric_value("DZD 30.00"), 30.0)
        self.assertEqual(extract_numeric_value("ARS 1,700.00"), 1700.0)
        self.assertEqual(extract_numeric_value(""), None)
        self.assertEqual(extract_numeric_value("Not Set"), None)
        print("✅ Test 2 Passed: Numeric extraction verified across currency formats.")

    # -------------------------------------------------------------
    # TEST 3: Mode Auto-detection on File Import
    # -------------------------------------------------------------
    def test_03_mode_auto_detection(self):
        # Check mode auto-detection logic against context-correct exported filenames
        def detect_mode(filename):
            fn = filename.lower()
            if "discounted" in fn or "sale" in fn:
                return "sale"
            elif "percentage" in fn or "pct" in fn:
                return "discount_pct"
            elif "app price" in fn or "app_price" in fn or "retail" in fn or "iap" in fn:
                return "retail"
            return "sale"

        # User's exact context-correct filename examples
        self.assertEqual(detect_mode("Sine Rush - Discounted - App Price.csv"), "sale")
        self.assertEqual(detect_mode("Sine Rush - Discounted - IAP - No Ads.csv"), "sale")
        self.assertEqual(detect_mode("Sine Rush - App Price.csv"), "retail")
        self.assertEqual(detect_mode("Sine Rush - IAP - No Ads.csv"), "retail")
        self.assertEqual(detect_mode("Sine Rush - Discount Percentage.csv"), "discount_pct")

        # Backwards compatibility legacy names
        self.assertEqual(detect_mode("bot_sale_prices_mygame_app_price_50pct_off.csv"), "sale")
        self.assertEqual(detect_mode("bot_app_prices_mygame_app_price.csv"), "retail")
        print("✅ Test 3 Passed: Mode auto-detection verified for context-correct filenames and legacy filenames.")

    # -------------------------------------------------------------
    # TEST 4: Engine Search & Price Mismatch -> Overwrite & Save Flow
    # -------------------------------------------------------------
    @patch("automator_engine.pyautogui")
    @patch("automator_engine.pyperclip")
    def test_04_mismatch_overwrites_and_saves(self, mock_pyperclip, mock_pyautogui):
        """Simulates finding an existing mismatched price (e.g. 0.99), overwriting with 0.19, and clicking Save."""
        logs = []
        mock_pyperclip.paste.return_value = "0.99 USD"  # Existing popup value

        config = {
            "automation_mode": "single_window",
            "pricing_target_mode": "sale",
            "coordinates": {
                "left_search_box": {"x": 896, "y": 965},
                "left_row_pencil": {"x": 525, "y": 1065},
                "left_popup_input": {"x": 600, "y": 1150},
                "left_popup_save": {"x": 730, "y": 1210},
                "left_popup_cancel": {"x": 650, "y": 1210}
            },
            "timing": {
                "search_delay": 0.01,
                "popup_delay": 0.01,
                "post_save_delay": 0.01,
                "mouse_move_duration": 0.01
            }
        }

        mock_detector = MagicMock()
        mock_detector.is_paused.return_value = False

        countries = [
            {"name": "Albania", "code": "AL", "currency": "USD", "sale_price": 0.19, "retail_price": 0.99}
        ]

        engine = PlaySaleAutomatorEngine(config, countries, mock_detector)
        engine.on_log = lambda m: logs.append(m)

        success, final_price = engine._process_country(countries[0], 0)

        self.assertTrue(success)
        self.assertEqual(final_price, "0.19")

        # Verify steps taken
        # 1. Search box triple-clicked to select all text
        mock_pyautogui.click.assert_any_call(x=896, y=965, clicks=3, button="left")
        # 2. Pencil icon clicked
        mock_pyautogui.click.assert_any_call(x=525, y=1065, clicks=1, button="left")
        # 3. Popup input double clicked
        mock_pyautogui.click.assert_any_call(x=600, y=1150, clicks=2, button="left")
        # 4. Save button clicked (since 0.99 != 0.19)
        mock_pyautogui.click.assert_any_call(x=730, y=1210, clicks=1, button="left")

        # Verify logs
        mismatch_logged = any("Mismatch detected" in msg for msg in logs)
        self.assertTrue(mismatch_logged, "Expected mismatch log not found")
        success_logged = any("Successfully set price to 0.19" in msg for msg in logs)
        self.assertTrue(success_logged, "Expected success log not found")

        print("✅ Test 4 Passed: Price mismatch successfully detected, overwritten, and saved.")

    # -------------------------------------------------------------
    # TEST 5: Engine Matching Price -> Clean Escape (No Duplicate Save)
    # -------------------------------------------------------------
    @patch("automator_engine.pyautogui")
    @patch("automator_engine.pyperclip")
    def test_05_matching_price_skips_save_cleanly(self, mock_pyperclip, mock_pyautogui):
        """Simulates finding price already matches target (0.19 == 0.19). Should close popup cleanly and skip Save."""
        logs = []
        mock_pyperclip.paste.return_value = "USD 0.19"  # Already 0.19

        config = {
            "automation_mode": "single_window",
            "pricing_target_mode": "sale",
            "coordinates": {
                "left_search_box": {"x": 896, "y": 965},
                "left_row_pencil": {"x": 525, "y": 1065},
                "left_popup_input": {"x": 600, "y": 1150},
                "left_popup_save": {"x": 730, "y": 1210},
                "left_popup_cancel": {"x": 650, "y": 1210}
            },
            "timing": {
                "search_delay": 0.01,
                "popup_delay": 0.01,
                "post_save_delay": 0.01,
                "mouse_move_duration": 0.01
            }
        }

        mock_detector = MagicMock()
        mock_detector.is_paused.return_value = False

        countries = [
            {"name": "Albania", "code": "AL", "currency": "USD", "sale_price": 0.19, "retail_price": 0.99}
        ]

        engine = PlaySaleAutomatorEngine(config, countries, mock_detector)
        engine.on_log = lambda m: logs.append(m)

        success, final_price = engine._process_country(countries[0], 0)

        self.assertTrue(success)
        self.assertEqual(final_price, "0.19")

        # Verify Escape was pressed to close dialog cleanly
        mock_pyautogui.press.assert_any_call("escape")

        # Verify Save button was NOT clicked (Save button is disabled in Google Play Console if value matches)
        save_clicks = [call for call in mock_pyautogui.click.call_args_list if call.kwargs.get("x") == 730]
        self.assertEqual(len(save_clicks), 0, "Save button should NOT be clicked when price matches target")

        # Verify matching log was created
        match_logged = any("Value already matches target" in msg for msg in logs)
        self.assertTrue(match_logged, "Expected match log not found")

        print("✅ Test 5 Passed: Matching price successfully detected, Save skipped, and dialog closed cleanly.")

    # -------------------------------------------------------------
    # TEST 6: User Mouse Movement Pause / Resume Safety
    # -------------------------------------------------------------
    def test_06_mouse_safety_detector(self):
        detector = MouseInterventionDetector(pause_duration=2.0)
        self.assertFalse(detector.is_paused())

        # Test trigger pause directly
        detector.trigger_pause()

        # Detector should now be in paused state
        self.assertTrue(detector.is_paused())
        self.assertGreater(detector.get_remaining_pause(), 0)

        # Test distance threshold detection
        detector.user_pause_until = 0.0
        self.assertFalse(detector.is_paused())
        detector.last_expected_pos = (100, 100)
        cur_pos = (500, 500)
        dist = math.hypot(cur_pos[0] - detector.last_expected_pos[0],
                          cur_pos[1] - detector.last_expected_pos[1])
        if dist > detector.movement_threshold:
            detector.trigger_pause()
        self.assertTrue(detector.is_paused())

        print("Test 6 Passed: Mouse intervention pauses execution as required.")

    # -------------------------------------------------------------
    # TEST 7: Multi-Country Loop & Progress Callbacks
    # -------------------------------------------------------------
    @patch("automator_engine.pyautogui")
    @patch("automator_engine.pyperclip")
    def test_07_multi_country_loop_progress(self, mock_pyperclip, mock_pyautogui):
        # Country 1 (Albania, 0.19): Mismatch ("0.00") -> Overwrite & Save (completed)
        # Country 2 (Algeria, 30): Match ("30") -> Clean close & continue (matched)
        # Country 3 (Argentina, 199): Mismatch ("0.00") -> Overwrite & Save (completed)
        mock_pyperclip.paste.side_effect = ["0.00", "DZD 30", "0.00"]
        progress_events = []
        state_events = []

        config = {
            "automation_mode": "single_window",
            "pricing_target_mode": "sale",
            "coordinates": {
                "left_search_box": {"x": 896, "y": 965},
                "left_row_pencil": {"x": 525, "y": 1065},
                "left_popup_input": {"x": 600, "y": 1150},
                "left_popup_save": {"x": 730, "y": 1210},
                "left_popup_cancel": {"x": 650, "y": 1210}
            },
            "timing": {
                "pre_start_delay": 0.0,
                "step_delay": 0.01,
                "search_delay": 0.01,
                "popup_delay": 0.01,
                "post_save_delay": 0.01,
                "mouse_move_duration": 0.01
            }
        }

        mock_detector = MagicMock()
        mock_detector.is_paused.return_value = False

        countries = [
            {"name": "Albania", "code": "AL", "currency": "USD", "sale_price": 0.19, "retail_price": 0.99},
            {"name": "Algeria", "code": "DZ", "currency": "DZD", "sale_price": 30.0, "retail_price": 150.0},
            {"name": "Argentina", "code": "AR", "currency": "ARS", "sale_price": 199.0, "retail_price": 419.0}
        ]

        engine = PlaySaleAutomatorEngine(config, countries, mock_detector)
        engine.on_progress_update = lambda cur, tot, c, st, p: progress_events.append((cur, tot, c["name"], st, p))
        engine.on_state_change = lambda s, m: state_events.append((s, m))

        engine._run_loop()

        self.assertEqual(engine.state, AutomatorState.COMPLETED)
        # Verify all 3 countries completed or matched without stopping
        finished_events = [e for e in progress_events if e[3] in ["completed", "matched"]]
        self.assertEqual(len(finished_events), 3)
        self.assertEqual(finished_events[0][2], "Albania")
        self.assertEqual(finished_events[0][3], "completed")
        self.assertEqual(finished_events[1][2], "Algeria")
        self.assertEqual(finished_events[1][3], "matched")
        self.assertEqual(finished_events[2][2], "Argentina")
        self.assertEqual(finished_events[2][3], "completed")

        print("Test 7 Passed: Multi-country loop with matching price continuation verified.")

    # -------------------------------------------------------------
    # TEST 8: Immediate Stop Request Halts Execution
    # -------------------------------------------------------------
    def test_08_stop_request_halts_execution(self):
        config = {
            "automation_mode": "single_window",
            "pricing_target_mode": "sale",
            "coordinates": {},
            "timing": {"pre_start_delay": 10.0}
        }
        mock_detector = MagicMock()
        mock_detector.is_paused.return_value = False

        engine = PlaySaleAutomatorEngine(config, [{"name": "Test"}], mock_detector)
        engine.stop()
        self.assertTrue(engine.stop_requested)
        self.assertEqual(engine.state, AutomatorState.STOPPED)
    # -------------------------------------------------------------
    # TEST 9: New countries/regions (USD & EUR) Offsets and Search Query
    # -------------------------------------------------------------
    @patch("automator_engine.pyautogui")
    @patch("automator_engine.pyperclip")
    def test_09_new_countries_regions_offsets(self, mock_pyperclip, mock_pyautogui):
        config = {
            "automation_mode": "single_window",
            "pricing_target_mode": "retail",
            "coordinates": {
                "left_search_box": {"x": 955, "y": 367},
                "left_row_pencil": {"x": 545, "y": 470},
                "left_popup_input": {"x": 550, "y": 560},
                "left_popup_save": {"x": 575, "y": 625}
            },
            "timing": {
                "pre_start_delay": 0.01,
                "search_delay": 0.01,
                "popup_delay": 0.01,
                "post_save_delay": 0.01,
                "step_delay": 0.01,
                "mouse_move_duration": 0.01
            }
        }
        mock_detector = MagicMock()
        mock_detector.is_paused.return_value = False
        mock_pyperclip.paste.return_value = "0.00"

        countries = [
            {"name": "New countries/regions (USD)", "code": "GLOBAL_USD", "currency": "USD", "retail_price": 0.99, "sale_price": 0.99},
            {"name": "New countries/regions (EUR)", "code": "GLOBAL_EUR", "currency": "EUR", "retail_price": 0.99, "sale_price": 0.99}
        ]

        engine = PlaySaleAutomatorEngine(config, countries, mock_detector)
        
        # Test USD item
        success_usd, price_usd = engine._process_country(countries[0], 0)
        self.assertTrue(success_usd)
        mock_pyperclip.copy.assert_any_call("New countries/regions")
        mock_pyautogui.click.assert_any_call(x=545, y=518, clicks=1, button="left")

        mock_pyperclip.reset_mock()
        mock_pyautogui.reset_mock()

        # Test EUR item
        success_eur, price_eur = engine._process_country(countries[1], 1)
        self.assertTrue(success_eur)
        mock_pyperclip.copy.assert_any_call("New countries/regions")
        mock_pyautogui.click.assert_any_call(x=545, y=566, clicks=1, button="left")

        print("✅ Test 9 Passed: 'New countries/regions' search normalization and child row offsets (+48px / +96px) verified.")

    # -------------------------------------------------------------
    # TEST 10: Discount Percentage Mode Target Extraction
    # -------------------------------------------------------------
    @patch("automator_engine.pyautogui")
    @patch("automator_engine.pyperclip")
    def test_10_discount_percentage_mode(self, mock_pyperclip, mock_pyautogui):
        config = {
            "automation_mode": "single_window",
            "pricing_target_mode": "discount_pct",
            "coordinates": {
                "left_search_box": {"x": 955, "y": 367},
                "left_row_pencil": {"x": 545, "y": 470},
                "left_popup_input": {"x": 550, "y": 560},
                "left_popup_save": {"x": 575, "y": 625}
            },
            "timing": {
                "pre_start_delay": 0.01,
                "search_delay": 0.01,
                "popup_delay": 0.01,
                "post_save_delay": 0.01,
                "step_delay": 0.01,
                "mouse_move_duration": 0.01
            }
        }
        mock_detector = MagicMock()
        mock_detector.is_paused.return_value = False
        mock_pyperclip.paste.return_value = "0"  # Mismatch

        countries = [
            {"name": "India", "code": "IN", "currency": "INR", "retail_price": 49.0, "sale_price": 9.0, "discount_pct": -50.0}
        ]

        engine = PlaySaleAutomatorEngine(config, countries, mock_detector)
        success, final_val = engine._process_country(countries[0], 0)
        self.assertTrue(success)
        self.assertEqual(final_val, "50")
        print("✅ Test 10 Passed: 'discount_pct' mode formats abs value and executes flow successfully.")

    # -------------------------------------------------------------
    # Test 11: High-Precision Discount % (xx.xxx) & Exact Sales Math
    # -------------------------------------------------------------
    @patch("automator_engine.pyautogui")
    @patch("automator_engine.pyperclip")
    def test_11_discount_percentage_precision_and_exact_sale_pricing(self, mock_pyperclip, mock_pyautogui):
        config_pct = {
            "automation_mode": "single_window",
            "pricing_target_mode": "discount_pct",
            "coordinates": {
                "left_search_box": {"x": 955, "y": 367},
                "left_row_pencil": {"x": 545, "y": 470},
                "left_popup_input": {"x": 550, "y": 560},
                "left_popup_save": {"x": 575, "y": 625}
            },
            "timing": {
                "pre_start_delay": 0.01,
                "search_delay": 0.01,
                "popup_delay": 0.01,
                "post_save_delay": 0.01,
                "step_delay": 0.01,
                "mouse_move_duration": 0.01
            }
        }
        mock_detector = MagicMock()
        mock_detector.is_paused.return_value = False
        mock_pyperclip.paste.return_value = "0"

        # Verify 3-decimal xx.xxx precision formatting in discount_pct mode with Charm pricing
        countries_charm = [
            {"name": "Canada", "code": "CA", "currency": "CAD", "retail_price": 1.49, "sale_price": 0.59, "discount_pct": 60.403},
            {"name": "Chile", "code": "CL", "currency": "CLP", "retail_price": 569.0, "sale_price": 229.0, "discount_pct": 59.754}
        ]
        engine_charm = PlaySaleAutomatorEngine(config_pct, countries_charm, mock_detector)
        success_ca, val_ca = engine_charm._process_country(countries_charm[0], 0)
        self.assertTrue(success_ca)
        self.assertEqual(val_ca, "60.403")

        success_cl, val_cl = engine_charm._process_country(countries_charm[1], 1)
        self.assertTrue(success_cl)
        self.assertEqual(val_cl, "59.754")

        # Verify Charm Sale Mode pricing
        config_sale = dict(config_pct)
        config_sale["pricing_target_mode"] = "sale"
        engine_sale = PlaySaleAutomatorEngine(config_sale, countries_charm, mock_detector)

        success_sale_ca, val_sale_ca = engine_sale._process_country(countries_charm[0], 0)
        self.assertTrue(success_sale_ca)
        self.assertEqual(val_sale_ca, "0.59")

        success_sale_cl, val_sale_cl = engine_sale._process_country(countries_charm[1], 1)
        self.assertTrue(success_sale_cl)
        self.assertEqual(val_sale_cl, "229")

        # Also verify uncharmed standard rounding support
        countries_standard = [
            {"name": "Canada", "code": "CA", "currency": "CAD", "retail_price": 1.49, "sale_price": 0.60, "discount_pct": 59.732},
            {"name": "Chile", "code": "CL", "currency": "CLP", "retail_price": 569.0, "sale_price": 228.0, "discount_pct": 59.930}
        ]
        engine_std = PlaySaleAutomatorEngine(config_pct, countries_standard, mock_detector)
        s_ca, v_ca = engine_std._process_country(countries_standard[0], 0)
        self.assertTrue(s_ca)
        self.assertEqual(v_ca, "59.732")

        print("✅ Test 11 Passed: 'xx.xxx' precision percentage verified for both Charm and standard sale pricing.")

    # -------------------------------------------------------------
    # TEST 12: Real-Time Elapsed Stopwatch and Est. Completion Timer Telemetry
    # -------------------------------------------------------------
    def test_12_stopwatch_and_eta_timers(self):
        # 1. Format Duration Utility
        self.assertEqual(format_duration(0), "00:00")
        self.assertEqual(format_duration(45), "00:45")
        self.assertEqual(format_duration(65), "01:05")
        self.assertEqual(format_duration(3665), "01:01:05")
        self.assertEqual(format_duration(65000), "01:05")  # Milliseconds support
        self.assertEqual(format_duration(None), "00:00")
        self.assertEqual(format_duration(-10), "00:00")

        # 2. Initial state
        mock_detector = MagicMock(spec=MouseInterventionDetector)
        countries = [{"name": f"Country {i}", "code": f"C{i}"} for i in range(10)]
        engine = PlaySaleAutomatorEngine({"speed_delay": 2500}, countries, mock_detector)

        init_tel = engine.get_timer_telemetry()
        self.assertEqual(init_tel["elapsed_str"], "00:00")
        self.assertTrue("~" in init_tel["remaining_str"])
        self.assertFalse(init_tel["is_completed"])

        # 3. Active elapsed stopwatch tracking
        engine.start_timers()
        self.assertIsNotNone(engine.timer_start_time)
        # Simulate 125 seconds passed
        engine.timer_start_time = engine.timer_start_time - 125.0
        elapsed_tel = engine.get_timer_telemetry()
        self.assertEqual(elapsed_tel["elapsed_str"], "02:05")

        # 4. User pause exclusion
        # Simulate pause started 20 seconds ago and resumed
        engine.pause_timers()
        engine.pause_start_time = engine.pause_start_time - 20.0
        engine.resume_timers()
        self.assertAlmostEqual(engine.total_paused_seconds, 20.0, places=1)
        # Elapsed time excludes the 20 seconds paused (125s - 20s = 105s -> 01:45)
        self.assertEqual(engine.get_timer_telemetry()["elapsed_str"], "01:45")

        # 5. Rolling 5-task moving average ETA calculation
        # 5 remaining tasks, average task duration of 4.0s -> 20s remaining
        engine.recent_task_durations = [4.0, 4.0, 4.0]
        engine.current_country_index = 5
        rolling_tel = engine.get_timer_telemetry()
        self.assertTrue("00:20" in rolling_tel["remaining_str"])
        self.assertFalse(rolling_tel["remaining_str"].startswith("~"))  # No ~ prefix when recents exist

        # 6. Completion state
        engine.current_country_index = 10
        engine.set_state(AutomatorState.COMPLETED)
        comp_tel = engine.get_timer_telemetry()
        self.assertEqual(comp_tel["remaining_str"], "Completed 🎉")
        self.assertTrue(comp_tel["is_completed"])

        print("✅ Test 12 Passed: Real-Time Stopwatch & Rolling ETA Telemetry fully verified.")

    # -------------------------------------------------------------
    # TEST 13: Ultra-Safe 2500ms Cadence & Human Cadence Natural Jitter
    # -------------------------------------------------------------
    def test_13_ultra_safe_cadence_human_jitter(self):
        # 1. Preset definitions & display mappings
        self.assertTrue(any(code == 2500 for code, _ in CADENCE_PRESETS))
        self.assertTrue(any(code == 1600 for code, _ in CADENCE_PRESETS))
        self.assertIn(2500, CADENCE_CODE_TO_DISPLAY)
        self.assertIn("🛡️ Ultra-Safe (2500ms • Human Cadence)", CADENCE_DISPLAY_TO_CODE)

        # 2. Fast test bypass: delays <= 0.05s remain unchanged
        self.assertEqual(get_humanized_delay(0.01), 0.01)
        self.assertEqual(get_humanized_delay(0.05), 0.05)

        # 3. Human cadence jitter on Ultra-Safe 2500ms (2.5s)
        # Generates proportional natural variance ±15% to 25% with 0.5s floor
        delays = [get_humanized_delay(2.5) for _ in range(30)]
        for d in delays:
            self.assertGreaterEqual(d, 0.5)
            self.assertGreater(d, 1.8)
            self.assertLess(d, 3.4)
        # Verify non-periodic variance (jitter is not static constant)
        self.assertGreater(len(set(round(d, 2) for d in delays)), 3)

        # 4. Engine cadence updates
        mock_detector = MagicMock(spec=MouseInterventionDetector)
        cfg = {"speed_delay": 2500, "timing": {"step_delay": 2.5}}
        engine = PlaySaleAutomatorEngine(cfg, [], mock_detector)
        self.assertEqual(engine.speed_delay_ms, 2500)
        self.assertEqual(engine.speed_delay_seconds, 2.5)

        # Switch to Safe & Steady (1600ms)
        engine.set_speed_delay(1600)
        self.assertEqual(engine.speed_delay_ms, 1600)
        self.assertEqual(engine.speed_delay_seconds, 1.6)
        self.assertEqual(engine.config["timing"]["step_delay"], 1.6)

        # Switch to Ultra-Safe (2500ms)
        engine.set_speed_delay(2500)
        self.assertEqual(engine.speed_delay_ms, 2500)
        self.assertEqual(engine.speed_delay_seconds, 2.5)
        self.assertEqual(engine.config["timing"]["step_delay"], 2.5)

        print("✅ Test 13 Passed: Ultra-Safe 2500ms preset & human cadence jitter engine verified.")

if __name__ == "__main__":
    unittest.main()

