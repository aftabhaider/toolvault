# ToolVault Unit Input Standard

Updated: 2026-10-08

## Purpose

Every calculator that accepts a physical measurement should make the unit visible at the input itself. Users should never have to guess whether a number means metres, feet, inches, square feet, litres, gallons or another unit.

## Plain-language labels

The label must tell a non-expert what physical quantity to enter. Technical terms may appear after the plain-English label, not instead of it. Add a one-line helper explaining where/how to measure the value when the meaning is not obvious.

Examples:
- Total rise → Floor-to-floor height
- Riser height → Height of one step
- Tread depth → Depth of one step
- Available run → Horizontal space available for the staircase
- Panel wattage → Power of one solar panel
- Conductor cross-section → Cable size
- Paint coverage → How much area does the paint cover?

## Input rule

Use a value input paired with a unit selector when a measurement can reasonably be entered in more than one unit.

Examples:
- Stair rise: mm, cm, in, ft, m
- Lumber thickness/width: mm, cm, in
- Lumber length: in, ft, m
- Area: m² or ft²
- Paint coverage: m²/L, ft²/L or ft²/US gal
- Cable length: m or ft
- Electrical voltage: V or kV
- Electrical current: mA, A or kA
- Solar panel power: W or kW
- Bag volume: ft³, m³ or L

## Quick-set controls

Where a calculator contains many repeated dimensional fields, provide a Quick set: Metric and Quick set: Imperial control for convenience.

Quick-set controls must convert the existing values before changing their displayed units. They must never silently replace user-entered measurements with unrelated defaults.

Users must still be able to change an individual field's unit after the quick set.

## Calculation rule

The UI may accept mixed units, but the calculation engine must receive one canonical internal unit system.

Examples:
- Construction volume: metres and cubic metres
- Paint: metres, square metres and litres
- Mulch: metres, square metres and cubic metres
- Board feet: inches for thickness/width and feet for length
- Stair geometry: inches internally for the current straight-stair engine
- Voltage drop: volts, amps, metres and mm²
- Solar panel area: millimetres internally for physical panel dimensions, watts for power

Convert at the UI boundary. Do not change the underlying engineering formula merely to accommodate display units.

## Conversion behavior

When a user changes an individual unit selector, preserve the physical quantity by converting the current value into the new unit.

When a user changes the Quick set, preserve every existing physical quantity, then update all relevant unit selectors.

Use exact conversion constants in the calculation layer and round only for display. Do not round a converted value before it reaches the calculation engine unless the user explicitly enters a rounded value.

## Fixed-unit inputs

Inputs whose units are inherently fixed can show the unit in the label instead of adding a selector.

Examples:
- Percentage
- Quantity/count
- Currency code
- Peak sun hours when the calculator is explicitly defined in hours
- Degrees for tilt/azimuth

Even fixed-unit inputs must include the unit in the label when the number alone could be ambiguous.

## Results

Every result involving a physical quantity must display its unit next to the number or in an adjacent unit label.

For mixed-unit calculators, result units should be selectable when that materially improves usability.

## QA gate

Before publishing a unit-input change:

1. Check that every physical measurement input has a visible unit.
2. Check individual-unit changes preserve the physical quantity.
3. Check Quick set changes preserve the physical quantity.
4. Check the canonical-unit conversion independently.
5. Re-run known worked examples for the calculator.
6. Check metric and imperial examples separately.
7. Verify labels, canonical URL, robots tag, internal links and sitemap remain valid.
