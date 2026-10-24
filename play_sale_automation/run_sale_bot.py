"""
Entry point to launch Google Play Sale Price Automator.
"""

import sys
import os

# Ensure script directory is on Python path
sys.path.insert(0, os.path.dirname(__file__))

from gui import PlaySaleAutomatorGUI

def main():
    print("==================================================")
    print("  Google Play Sale Price Automator • Dual Robot   ")
    print("  PlayPriceEngine (Right) ➔ Play Console (Left)   ")
    print("==================================================")
    app = PlaySaleAutomatorGUI()
    app.mainloop()

if __name__ == "__main__":
    main()
