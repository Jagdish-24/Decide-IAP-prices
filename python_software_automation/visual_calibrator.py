"""
Visual Calibrator and Screen Capture Engine for Play Sale Automator.
Provides native Win32/GDI screen capture, coordinate crop previews,
and interactive visual point calibration with zoom loupe.
"""

import os
import time
import math
import ctypes
from ctypes import wintypes
import tkinter as tk
from PIL import Image, ImageDraw, ImageTk

# DPI Awareness to prevent coordinate virtualization on high-res displays
try:
    ctypes.windll.shcore.SetProcessDpiAwareness(2)
except Exception:
    try:
        ctypes.windll.user32.SetProcessDPIAware()
    except Exception:
        pass


import threading
import glob

try:
    import cv2
    import numpy as np
    HAS_OPENCV = True
except ImportError:
    HAS_OPENCV = False

def _raw_gdi_capture():
    user32 = ctypes.windll.user32
    gdi32 = ctypes.windll.gdi32

    # Attach to input desktop if available in this thread
    hdesk_input = user32.OpenInputDesktop(0, False, 0x01FF)
    if hdesk_input:
        user32.SetThreadDesktop(hdesk_input)

    try:
        w = user32.GetSystemMetrics(0)
        h = user32.GetSystemMetrics(1)

        hdc = user32.GetDC(0)
        if not hdc:
            return None

        try:
            hdc_mem = gdi32.CreateCompatibleDC(hdc)
            hbm = gdi32.CreateCompatibleBitmap(hdc, w, h)
            old_bm = gdi32.SelectObject(hdc_mem, hbm)

            ret = gdi32.BitBlt(hdc_mem, 0, 0, w, h, hdc, 0, 0, 0x00CC0020)  # SRCCOPY
            if not ret:
                gdi32.SelectObject(hdc_mem, old_bm)
                gdi32.DeleteObject(hbm)
                gdi32.DeleteDC(hdc_mem)
                return None

            class BITMAPINFOHEADER(ctypes.Structure):
                _fields_ = [
                    ('biSize', ctypes.c_uint32),
                    ('biWidth', ctypes.c_int32),
                    ('biHeight', ctypes.c_int32),
                    ('biPlanes', ctypes.c_uint16),
                    ('biBitCount', ctypes.c_uint16),
                    ('biCompression', ctypes.c_uint32),
                    ('biSizeImage', ctypes.c_uint32),
                    ('biXPelsPerMeter', ctypes.c_int32),
                    ('biYPelsPerMeter', ctypes.c_int32),
                    ('biClrUsed', ctypes.c_uint32),
                    ('biClrImportant', ctypes.c_uint32)
                ]

            bmi = BITMAPINFOHEADER()
            bmi.biSize = ctypes.sizeof(BITMAPINFOHEADER)
            bmi.biWidth = w
            bmi.biHeight = -h  # top-down orientation
            bmi.biPlanes = 1
            bmi.biBitCount = 32
            bmi.biCompression = 0

            buf = ctypes.create_string_buffer(w * h * 4)
            gdi32.GetDIBits(hdc_mem, hbm, 0, h, buf, ctypes.byref(bmi), 0)

            # Cleanup GDI handles
            gdi32.SelectObject(hdc_mem, old_bm)
            gdi32.DeleteObject(hbm)
            gdi32.DeleteDC(hdc_mem)

            img = Image.frombuffer('RGBA', (w, h), buf, 'raw', 'BGRA', 0, 1)
            return img.convert('RGB')
        finally:
            user32.ReleaseDC(0, hdc)
    finally:
        if hdesk_input:
            user32.CloseDesktop(hdesk_input)


def capture_desktop_image():
    """
    Captures a full-resolution PIL Image of the desktop using native Win32 BitBlt.
    Runs inside a dedicated clean worker thread so that OpenInputDesktop/SetThreadDesktop
    operates reliably even when invoked from a Tkinter main thread with active windows.
    """
    result = [None]

    def _worker():
        try:
            result[0] = _raw_gdi_capture()
        except Exception as e:
            result[0] = None

    t = threading.Thread(target=_worker, daemon=True)
    t.start()
    t.join(timeout=4.0)
    return result[0]


class VisualScreenshotManager:
    """
    Manages automated step-by-step verification screenshots.
    Guarantees that a maximum of 5 screenshots are retained at all times (FIFO: deletes oldest).
    """
    def __init__(self, directory=None, max_screenshots=5):
        if directory is None:
            directory = os.path.join(os.path.dirname(os.path.abspath(__file__)), "screenshots")
        self.directory = directory
        self.max_screenshots = max_screenshots
        os.makedirs(self.directory, exist_ok=True)

    def capture_and_save(self, step_name, label="", img=None):
        """
        Captures or takes a PIL Image, saves it to the dedicated screenshots folder,
        and enforces the maximum 5 screenshots quota by pruning older ones.
        """
        if img is None:
            img = capture_desktop_image()
        if not img:
            return None, None

        os.makedirs(self.directory, exist_ok=True)
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        clean_label = "".join(c if c.isalnum() else "_" for c in str(label)).strip("_")
        if clean_label:
            filename = f"{step_name}_{clean_label}_{timestamp}.png"
        else:
            filename = f"{step_name}_{timestamp}.png"

        filepath = os.path.join(self.directory, filename)
        try:
            img.save(filepath)
            self._prune_screenshots()
            return filepath, img
        except Exception as e:
            print(f"[ScreenshotManager] Error saving screenshot: {e}")
            return None, img

    def _prune_screenshots(self):
        """Deletes oldest screenshots to strictly maintain at most max_screenshots."""
        try:
            pattern = os.path.join(self.directory, "*.png")
            files = sorted(glob.glob(pattern), key=os.path.getmtime)
            while len(files) > self.max_screenshots:
                oldest = files.pop(0)
                try:
                    os.remove(oldest)
                except Exception:
                    pass
        except Exception as e:
            print(f"[ScreenshotManager] Error pruning screenshots: {e}")

    def get_recent_screenshots(self):
        """Returns sorted list of current screenshot file paths."""
        try:
            pattern = os.path.join(self.directory, "*.png")
            return sorted(glob.glob(pattern), key=os.path.getmtime)
        except Exception:
            return []


def locate_search_bar_visual(img=None):
    """
    Visually locates the Google Play Console search bar pill in the left screen half.
    Returns (center_x, center_y) or None if not detected.
    """
    if not HAS_OPENCV:
        return None
    if img is None:
        img = capture_desktop_image()
    if not img:
        return None

    try:
        cv_img = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
        h, w = cv_img.shape[:2]
        left_w = w // 2

        # Search area: left half, Y between 100 and 750
        roi = cv_img[100:750, :left_w]
        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        thresh = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 2)
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        for c in contours:
            x, y, bw, bh = cv2.boundingRect(c)
            # Material 3 pill shape: width 220 to 520, height 28 to 56
            if 220 <= bw <= 520 and 28 <= bh <= 56:
                patch = roi[y:y+bh, x:x+bw]
                mean_bgr = np.mean(patch, axis=(0, 1))
                if mean_bgr[0] > 195 and mean_bgr[1] > 195 and mean_bgr[2] > 195 and mean_bgr[0] >= mean_bgr[2] - 5:
                    return (x + bw // 2, (y + 100) + bh // 2)
    except Exception as e:
        print(f"[VisualCalibrator] Search bar detection warning: {e}")
    return None


def locate_first_row_pencil_visual(img=None, search_bar_y=None):
    """
    Visually locates the pencil icon of the first table row beneath the search bar.
    Returns (center_x, center_y) or None if not detected.
    """
    if not HAS_OPENCV:
        return None
    if img is None:
        img = capture_desktop_image()
    if not img:
        return None

    try:
        cv_img = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
        h, w = cv_img.shape[:2]
        left_w = w // 2

        sy = search_bar_y or 367
        # Search table lines below search_y
        table_roi = cv_img[sy + 30 : min(h, sy + 320), :left_w]
        t_gray = cv2.cvtColor(table_roi, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(t_gray, 50, 150)
        lines = cv2.HoughLinesP(edges, 1, np.pi/180, threshold=100, minLineLength=200, maxLineGap=10)

        if lines is not None:
            raw_ys = sorted(list(set([int(l[1] + sy + 30) for l in lines])))
            clustered = []
            for y in raw_ys:
                if not clustered or abs(y - clustered[-1]) > 8:
                    clustered.append(y)
            if len(clustered) >= 2:
                row_y = (clustered[0] + clustered[1]) // 2
                pencil_x = int(left_w * 0.426)  # ~545 on 1280
                return (pencil_x, row_y)
    except Exception as e:
        print(f"[VisualCalibrator] Row pencil detection warning: {e}")
    return None


def locate_price_popup_visual(img=None, fallback_pt=None):
    """
    Visually detects the input box in the 'Edit price' popup dialog.
    Returns (input_x, input_y) or fallback.
    """
    if not HAS_OPENCV:
        return fallback_pt
    if img is None:
        img = capture_desktop_image()
    if not img:
        return fallback_pt

    try:
        cv_img = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
        h, w = cv_img.shape[:2]
        left_w = w // 2

        # Look in the region around row 1 (Y: 400 to 800, X: 300 to 800)
        roi = cv_img[400:800, 300:min(left_w, 800)]
        b, g, r = roi[:, :, 0], roi[:, :, 1], roi[:, :, 2]
        blue_mask = (b.astype(int) - r.astype(int) > 60) & (b > 160)
        ys, xs = np.where(blue_mask)
        if len(xs) > 20:
            bx = np.mean(xs) + 300
            by = np.mean(ys) + 400
            return (int(bx), int(by))
    except Exception as e:
        print(f"[VisualCalibrator] Price popup input detection warning: {e}")
    return fallback_pt


def generate_point_crop(img, x, y, size=110, color="#38BDF8", label=None):
    """
    Extracts a square crop around (x, y) with an overlaid visual crosshair,
    circular target ring, and coordinate badge.
    """
    if img is None:
        # Fallback placeholder image
        placeholder = Image.new("RGB", (size, size), "#090D16")
        draw = ImageDraw.Draw(placeholder)
        draw.text((size // 4, size // 2 - 8), "No Capture", fill="#64748B")
        return placeholder

    w, h = img.size
    half = size // 2

    # Clamp bounds safely
    left = max(0, min(w - size, x - half))
    top = max(0, min(h - size, y - half))
    right = left + size
    bottom = top + size

    crop = img.crop((left, top, right, bottom)).copy()
    draw = ImageDraw.Draw(crop)

    # Relative center inside the crop
    cx = x - left
    cy = y - top

    # Draw target crosshair
    draw.line([(cx - 16, cy), (cx + 16, cy)], fill=color, width=2)
    draw.line([(cx, cy - 16), (cx, cy + 16)], fill=color, width=2)

    # Draw circular center ring
    draw.ellipse([(cx - 6, cy - 6), (cx + 6, cy + 6)], outline=color, width=2)
    draw.point((cx, cy), fill="#FFFFFF")

    # Draw outer border
    draw.rectangle([(0, 0), (size - 1, size - 1)], outline="#334155", width=1)

    return crop


class ScreenPinOverlay(tk.Toplevel):
    """
    Interactive full-screen visual calibration overlay.
    Displays a real-time frozen screenshot of the desktop with a 4x zoom loupe
    and crosshair, allowing the user to click on the exact pixel of any UI element.
    """
    def __init__(self, parent, point_key, point_title, screenshot_img, on_picked_callback):
        super().__init__(parent)
        self.point_key = point_key
        self.point_title = point_title
        self.screenshot_img = screenshot_img
        self.on_picked_callback = on_picked_callback

        self.overrideredirect(True)
        self.attributes("-topmost", True)

        w, h = screenshot_img.size
        self.geometry(f"{w}x{h}+0+0")

        self.canvas = tk.Canvas(self, width=w, height=h, highlightthickness=0, cursor="crosshair", bg="#000")
        self.canvas.pack(fill="both", expand=True)

        self.bg_photo = ImageTk.PhotoImage(screenshot_img)
        self.canvas.create_image(0, 0, image=self.bg_photo, anchor="nw")

        # Top Instruction Banner
        self.canvas.create_rectangle(0, 0, w, 44, fill="#080D1A", outline="")
        self.canvas.create_line(0, 44, w, 44, fill="#1E293B", width=1)
        self.canvas.create_text(
            w // 2, 22,
            text=f"🎯 CALIBRATING: [{point_title}]  •  Hover over target element & CLICK to pin  •  Press [ESC] to cancel",
            fill="#38BDF8", font=("Segoe UI", 11, "bold")
        )

        # Magnifier Loupe state
        self.loupe_size = 140
        self.zoom = 4
        self.sample_size = self.loupe_size // self.zoom
        self.loupe_img_id = None
        self.loupe_photo = None

        self.canvas.bind("<Motion>", self._on_mouse_move)
        self.canvas.bind("<Button-1>", self._on_click)
        self.bind("<Escape>", lambda e: self.destroy())
        self.focus_force()

    def _on_mouse_move(self, event):
        x, y = event.x, event.y
        sw, sh = self.screenshot_img.size
        half = self.sample_size // 2

        # Extract small patch around cursor
        lx = max(0, min(sw - self.sample_size, x - half))
        ly = max(0, min(sh - self.sample_size, y - half))
        patch = self.screenshot_img.crop((lx, ly, lx + self.sample_size, ly + self.sample_size))

        # Magnify by zoom factor using nearest neighbor for sharp pixel grid
        mag = patch.resize((self.loupe_size, self.loupe_size), Image.Resampling.NEAREST)
        draw = ImageDraw.Draw(mag)

        # Draw crosshair at center of loupe
        cx, cy = self.loupe_size // 2, self.loupe_size // 2
        draw.line([(cx - 15, cy), (cx + 15, cy)], fill="#EF4444", width=2)
        draw.line([(cx, cy - 15), (cx, cy + 15)], fill="#EF4444", width=2)
        draw.ellipse([(cx - 4, cy - 4), (cx + 4, cy + 4)], outline="#EF4444", width=1)
        draw.rectangle([(0, 0), (self.loupe_size - 1, self.loupe_size - 1)], outline="#38BDF8", width=2)

        # Coordinate badge
        draw.rectangle([(2, self.loupe_size - 18), (self.loupe_size - 2, self.loupe_size - 2)], fill="#080D1A")
        draw.text((8, self.loupe_size - 16), f"X: {x} | Y: {y}", fill="#38BDF8")

        self.loupe_photo = ImageTk.PhotoImage(mag)

        # Position loupe offset from cursor so it doesn't block the view
        offset_x = 24 if x + 24 + self.loupe_size < sw else -(self.loupe_size + 24)
        offset_y = 24 if y + 24 + self.loupe_size < sh else -(self.loupe_size + 24)

        if self.loupe_img_id:
            self.canvas.coords(self.loupe_img_id, x + offset_x, y + offset_y)
            self.canvas.itemconfig(self.loupe_img_id, image=self.loupe_photo)
        else:
            self.loupe_img_id = self.canvas.create_image(x + offset_x, y + offset_y, image=self.loupe_photo, anchor="nw")

    def _on_click(self, event):
        x, y = event.x, event.y
        if self.on_picked_callback:
            self.on_picked_callback(self.point_key, {"x": x, "y": y})
        self.destroy()

