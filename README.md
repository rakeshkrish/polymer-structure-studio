# Polymer Structure Studio

A lightweight browser app for generating initial LAMMPS data files for bead-spring polymers, free LJ particles, and mixed systems.

## Use

Open `index.html` in a modern browser, choose the unit and system types, enter the bead composition and box dimensions, then generate `system.data`.

The generator places particles without overlaps, supports bead-type assignments by index or range, and can place a wavy polymer segment between two selected tether beads. The generated data file contains initial coordinates and topology; configure force-field coefficients, boundary conditions, and any runtime tether constraints in your LAMMPS input script.

This is a static client-side app; no server or dependency installation is required.
