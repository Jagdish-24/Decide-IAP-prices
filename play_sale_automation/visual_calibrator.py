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

