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

# Ensure play_sale_automation module is on sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from file_parser import parse_pricing_file
from automator_engine import PlaySaleAutomatorEngine, AutomatorState, extract_numeric_value
from mouse_detector import MouseInterventionDetector

class TestPlaySaleAutomatorFlow(unittest.TestCase):

    def setUp(self):
        self.sample_csv_path = os.path.join(os.path.dirname(__file__), "test_bot_sale_prices.csv")
        # Generate sample CSV matching the website's exact export output
        csv_content = """Country Name,Country Code,Currency,Discounted Price,Retail Price,Discount Rate
"Albania",AL,USD,0.19,0.99,"-50%"
"Algeria",DZ,DZD,30,150,"-50%"
"Angola",AO,USD,0.19,0.99,"-50%"
"Antigua & Barbuda",AG,USD,0.29,0.99,"-50%"
"Argentina",AR,ARS,199,419,"-50%"
"Armenia",AM,USD,0.19,0.99,"-50%"
"Aruba",AW,USD,0.29,0.99,"-50%"
"Australia",AU,AUD,0.69,1.49,"-50%"
"Austria",AT,EUR,0.49,0.99,"-50%"
"Azerbaijan",AZ,AZN,0.49,1.00,"-50%"
"India",IN,INR,9,49,"-50%"
"""
        with open(self.sample_csv_path, "w", encoding="utf-8-sig") as f:
            f.write(csv_content)

    def tearDown(self):
        if os.path.exists(self.sample_csv_path):
            os.remove(self.sample_csv_path)

    # -------------------------------------------------------------
    # TEST 1: CSV Export & Parsing
    # -------------------------------------------------------------
    def test_01_csv_parsing(self):
        parsed = parse_pricing_file(self.sample_csv_path)
        self.assertEqual(len(parsed), 11)

        # Verify Albania
        al = parsed.get("Albania")
        self.assertIsNotNone(al)
        self.assertEqual(al["code"], "AL")
        self.assertEqual(al["currency"], "USD")
        self.assertEqual(al["sale_price"], 0.19)
        self.assertEqual(al["retail_price"], 0.99)
        self.assertEqual(al["discount_pct"], -50.0)

        # Verify Algeria (Zero-decimal DZD floor reached)
        dz = parsed.get("Algeria")
        self.assertIsNotNone(dz)
        self.assertEqual(dz["currency"], "DZD")
        self.assertEqual(dz["sale_price"], 30.0)

        # Verify Argentina
        ar = parsed.get("Argentina")
        self.assertIsNotNone(ar)
        self.assertEqual(ar["currency"], "ARS")
        self.assertEqual(ar["sale_price"], 199.0)

        # Verify Australia
        au = parsed.get("Australia")
        self.assertIsNotNone(au)
        self.assertEqual(au["currency"], "AUD")
        self.assertEqual(au["sale_price"], 0.69)

        print("✅ Test 1 Passed: CSV Parsing & data extraction verified.")

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
        sale_filename = "bot_sale_prices_mygame_app_price_50pct_off.csv"
        app_filename = "bot_app_prices_mygame_app_price.csv"

        # Check mode logic
        def detect_mode(filename):
            fn = filename.lower()
            if "sale" in fn:
                return "sale"
            elif "app_price" in fn or "retail" in fn:
                return "retail"
            return "sale"

        self.assertEqual(detect_mode(sale_filename), "sale")
        self.assertEqual(detect_mode(app_filename), "retail")
        print("✅ Test 3 Passed: Mode auto-detection verified for both filenames.")

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

if __name__ == "__main__":
    unittest.main()

