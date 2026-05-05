#!/usr/bin/env python
"""Minimal GPIO/button behavior test"""
import os
import sys

# Ensure we can import from the repo
sys.path.insert(0, r'C:\Cursor_Projects\Smart-Mirror')

try:
    # Test 1: Import modules
    from hardware.gpio.config import ButtonId, DEBOUNCE_MS
    from hardware.gpio.events import ButtonAction, ButtonEvent
    from backend.services.button_service import handle_button_event
    
    print("✓ Imports successful")
    
    # Test 2: Verify DEBOUNCE_MS defaults to 80
    assert DEBOUNCE_MS == 80, f"Expected DEBOUNCE_MS=80, got {DEBOUNCE_MS}"
    print(f"✓ DEBOUNCE_MS defaults to {DEBOUNCE_MS} when GPIO_DEBOUNCE_MS unset")
    
    # Test 3: Test handle_button_event with LAYOUT and CLICK
    event_click = ButtonEvent(button_id=ButtonId.LAYOUT, action=ButtonAction.CLICK)
    result_click = handle_button_event(event_click, db=object())
    assert result_click["effect"] == "menu_select", f"Expected menu_select, got {result_click['effect']}"
    print(f"✓ handle_button_event(LAYOUT, CLICK) returns effect: {result_click['effect']}")
    
    # Test 4: Test handle_button_event with LAYOUT and LONG_PRESS
    event_long = ButtonEvent(button_id=ButtonId.LAYOUT, action=ButtonAction.LONG_PRESS)
    result_long = handle_button_event(event_long, db=object())
    assert result_long["effect"] == "menu_select", f"Expected menu_select, got {result_long['effect']}"
    print(f"✓ handle_button_event(LAYOUT, LONG_PRESS) returns effect: {result_long['effect']}")
    
    print("\n✓✓✓ ALL TESTS PASSED ✓✓✓")
    
except Exception as e:
    print(f"\n✗✗✗ TEST FAILED ✗✗✗")
    print(f"Error: {type(e).__name__}: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
