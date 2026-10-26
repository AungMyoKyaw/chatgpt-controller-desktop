# ChatGPT Controller — Impeccable Operate Design

## World: Quiet Control Room
A sophisticated native desktop utility, not a generic dashboard or chat clone. Calm warm-gray/white foundation, controlled marine blue and teal-green for active states, finely differentiated navigation and information surfaces. Distinctly utilitarian, with visible orientation, grounded state and meticulous alignment. Light mode by default with dark mode supported.

## Palette
Light: canvas #F6F7F5; sidebar #EAEFEB; surface #FFFFFF; text #1B2B31; muted #66777B; line #DCE5E0; accent #315BD4; accent-hover #244ABC; accent-soft #E9EEFF; teal #087F69; warning #AC6C27; danger #BC4750.
Dark: canvas #111B21; sidebar #17242B; surface #1D2B33; text #EEF4F2; muted #A5B7B6; line #344650; accent #9FB6FF; accent-soft #293E61; teal #73D8BA; warning #E7BC73; danger #FFACB1.

## Typography
Native system sans, 13-15px operating text, 24-34px section titles with disciplined tracking. Code labels and endpoints use SF Mono/monospace, 11-13px. All controls labeled, no jargon-only headings.

## Architecture and hierarchy
234px sidebar with brand, Setup, API access, API explorer, Relay sample, footer health. Main workspace 820px maximum content width. Compact status strip at top with browser/API state. Setup uses a *single three-stage stepper* with instructions and functional actions, plus useful system detail lines. API access shows URL, obscured key and copy, safety note. Explorer has request composer, JSON result/readiness. Samples page shows numbered practical usage and commands with copy. No nested KPI cards or decorations.

## Motion, accessibility and edge states
Clear keyboard focus, shortcut suggestions, native macOS titlebar safe top offset. Muted purposeful transitions only, reduced motion compliance. Asynchronous controls show real progress and nonblocking error guidance. Expose insufficient prerequisite as actionable recovery. Never label an API call successful until server responds. No password field in controller.
