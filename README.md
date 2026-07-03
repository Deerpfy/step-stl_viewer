# STEP / STL Viewer

Offline 3D viewer for CAD files. Double-click `index.html` - it runs entirely from the
file:// protocol in Chrome, Edge, or Firefox. No server, no install, no network access.

Supported formats: STEP (`.step`, `.stp`) and STL (binary and ASCII).
Each opened file gets its own tab (camera, selection, and measurements are
remembered per tab); hold Shift while opening to add into the current tab.

| Key | Action | Key | Action |
| --- | --- | --- | --- |
| O | Open files (Shift adds) | M | Measure distance |
| , / . | Previous / next tab | C | Section planes |
| F | Fit view | D | Explode view |
| 1-7 | Standard views / isometric | G | Toggle grid |
| V | Perspective / orthographic | T | Transform (move/rotate/scale) |
| S E W X | Shaded / edges / wireframe / x-ray | H I U | Hide / isolate / show all |
| P | Screenshot PNG | ? | All shortcuts |

Rebuild after changing `src/`: `npm install` once, then `npm run build`; `npm test` + `npm run verify` check it.
