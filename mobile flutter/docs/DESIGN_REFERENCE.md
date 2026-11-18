# Design references

## Source of truth

Parent website snapshot: `../index.html`, with saved screens in `../views/`. Desktop screenshots are under `../previews/` at 1440×1000. The snapshot README documents it as a static capture with sidebar navigation; other controls are largely inert.

## Phone viewport observations

Chrome headless captures were made at device scale factor 1:

- 390×844 CSS pixels: all nine routes.
- 430×932 CSS pixels: Home.

PNG captures are session artifacts under:
`C:\Users\PC\.copilot\session-state\6d9586bc-ca58-40c7-b7d4-6689c2867f5d\files\`

The website's desktop sidebar is hidden at these widths with no visible replacement menu. Existing layouts retain substantial horizontal clipping/overflow. These are source-observation captures, not Flutter comparison evidence.

## Typography and assets

- Satoshi variable font: copied to `assets/fonts/satoshi-var.woff2` from `../fonts/satoshi-var.woff2`.
- IBM Plex Mono 400/700: copied to `assets/fonts/ibm-plex-mono-400.woff2` and `assets/fonts/ibm-plex-mono-700.woff2` from `../fonts/`.
- Source CSS: `../assets/styles-AgSgb1lZ.css` plus the page-specific compiled styles in `../assets/`.
- Original website assets are read-only and must not be edited or moved.

## Initial observed tokens

The main CSS uses the `Satoshi` sans family and `IBM Plex Mono` for monospaced text. The dark theme declarations include:

- Background: `oklch(14.7% .004 49.25)`
- Foreground: `oklch(98.5% .001 106.423)`
- Card: `oklch(21.6% .006 56.043)`
- Muted/accent surface: `oklch(26.8% .007 34.298)`
- Muted foreground: `oklch(70.9% .01 56.259)`
- Border: `oklch(100% 0 0/.1)`
- Radius base: `.25rem` (components use derived radii)

Translate CSS color values into Flutter colors and verify against rendered pixels before treating these as final design tokens. Preserve original component-specific colors, including status and agent accents.

## Navigation

The sidebar order/groups are visible in `../previews/home.png`: Home; Chat, Inbox, Board; Agents, Docs, Company Brain, Workflows; Labs / Canvas; user profile at the bottom. The approved Flutter drawer should preserve this grouping, order, labels, icons, badges, and active state. No bottom tab bar.

## Decisions and pending comparison

- Product identity “SuperAgent” applies to the Flutter app only. Do not edit the source website name/branding.
- Home is the representative implementation. Its source at phone widths has a hidden sidebar, a clipped composer, and clipped side-by-side widgets. The drawer, fitting the composer, and stacking widgets are adaptation proposals that must be documented and visually reviewed with the user.
- No Flutter screenshot has been produced yet; no screen is visually verified.
