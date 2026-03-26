# Playbook Creator Starter

A GitHub Pages-friendly starter for a football-first playbook creator.

## What is included
- Football-focused UI, not a generic drawing layout
- Route pen with auto-smoothing
- Pointer/touch support for mobile, tablet, stylus, and desktop
- Offense/defense presets
- Export to PNG
- Undo/redo and clear board

## How to publish on GitHub Pages
1. Create a new GitHub repository.
2. Upload `index.html`, `styles.css`, and `script.js`.
3. In GitHub, go to **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select the `main` branch and `/root` folder.
6. Save, then wait for the published URL.

GitHub Pages serves static HTML, CSS, and JavaScript files directly from a repository, which makes this a good no-cost place to start for an MVP. citeturn182080search0turn182080search8

## Suggested next features
- Drag-and-drop player editing
- Route templates library
- Formation save/load
- PDF play sheet export
- Weekly install and call sheet builder
- Team branding / terminology settings

## Technical note
The drawing engine uses Pointer Events so the same code path can support mouse, touch, and stylus input. `getCoalescedEvents()` can help produce smoother drawing paths by exposing higher-fidelity pointer movement data when the browser supports it. citeturn182080search1turn182080search3turn182080search9
