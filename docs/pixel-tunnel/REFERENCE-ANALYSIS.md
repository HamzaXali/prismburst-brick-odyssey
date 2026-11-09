# Pixel Tunnel — reference notes and implementation choices

The ten public clips were reviewed for look and motion only. They are not stored in this repo, and the game does not copy their art, names, logos, on-screen text, or level geometry. The 40 levels use the owner's theme list with original layouts.

Where a clip clearly shows something that differs from the written Part 6 rules, the footage is what ships. Where a clip does not show the rule (combo clock, spawn cell, fall speed, score, lives, launch angle, win condition), the written value stays the CONFIG default. Nothing here is claimed to match a frame exactly. Colors below are compressed samples, not source pixels.

## Footage versus the written rules

| Topic | Written Part 6 | What the clips show | What this build does |
|---|---|---|---|
| Tunnel border | Red blocked wall | Light grey outline about one cell thick | Solid field color with a 1px grey lip on the open edge. Breaking a cell does not kick the ball back out. |
| Entrance | Exactly one green 2-cell mouth, rest of the bottom row red | No green mouth. Some layouts have two lower openings | Open mouths, no green fill. Several themes use more than one mouth. The validator only checks that every yellow target can be reached from a mouth. |
| Multiball | Every moving ball becomes 3 where it is, cap 12 | A catch releases a tight upward stream; late clips show hundreds of dots | Catch fires `MULTIBALL_ADD` (64) balls from the paddle in a narrow cone. Pool is 420. |
| Safety | Green stick 1.8× the paddle, 6 cells below it, 10s | Thin red/orange line across the bottom of the playfield, just under the paddle | Full-width bar at the bottom of the canvas, paddle just above it. Duration stays 10s. |
| Other rewards | Only the cyan +3 | Green, orange, pink, and a yellow star also fall | Those four extra drops are in CONFIG. Cyan still means +3 balls from the paddle, +50 points, and the safety bar. The other effects (life, score, widen, star) are assumptions. |
| Paddle | 9.5 × 0.75 cells near row 67.5 | Thin flat orange rectangle, no knob | `PADDLE_W_CELLS` 11, `PADDLE_H_CELLS` 0.38, flat rect, no rounded pill. |
| Ball | Diameter 0.75 cell, speed 210 | Tiny fast white dots | Diameter 0.42 cell. Speed 680. Phone test showed 210 was too slow. |
| Field damage | Ordinary cells break on contact and the ball bounces off | Balls get inside the mass and leave jagged cavities | A broken cell is entered. The ball keeps its speed and kinks every few cells, so it rattles inside the hole. |
| Combo, spawn, fall, win | x1/x2/x3 in 2.5s, badge at row 2, 3.5 cells/s, win by clearing yellow | Not established. A yellow cap can disappear long before the win panel | Those written values stay the defaults. Win is still every yellow target. Star count on the clear screen is 3 / 2 / 1 from lives lost, which the clips do not explain. |
| Launch and tap | Move the stick to launch, tap breaks one adjacent brick | Clips start with the ball already moving. No taps are visible | Kept. There is no launch button. |

## Method and limits
All ten public videos downloaded successfully with yt-dlp (no account/session used). ffprobe checked durations/dimensions; ffmpeg created 480px-high silent H.264 copies and 1 fps review frames for the entire clips. I visually inspected 15 evenly distributed frames per video (150 total) plus individual v07 reward/catch frames at 0.25s intervals. This is a representative frame review, NOT continuous frame-by-frame playback, so brief triggers, input gestures and exact timing remain unverified. No scene-change extraction was needed in these predominantly static-camera clips. Timestamps are seconds relative to each clip, not wall-clock times.

Coordinates: upper pixel field, lower free-play region, and relative cell estimates. Measurements use v07 270x480 review image: field approximately x18..251,y45..280, cell pitch ~4.7px; therefore about 50x50. Counting is approximate due compression. Other recordings have different margins/zoom. Colors are representative decoded JPEG RGB samples (PIL frequency samples), NOT original source colors. Palette varies with video compression, texture and rescaling.

Download metadata caveat: v02–v10 are reported as playlists because their posts include quoted media. Logs show first media was saved to requested vNN.mp4; second quoted media was skipped as filename already existed. The saved actual first clip was visually inspected. post-texts.json preserves returned parent-post descriptions, mostly only t.co links. No unavailable/private post was accessed.

## Asset inventory
|Video|Source|Duration s|Original MB|Small MB|Frames|
|---|---|---:|---:|---:|---:|
|v01|https://x.com/jbiruna/status/2116386551383117893|161.15|10.41|1.84|161|
|v02|https://x.com/jbiruna/status/2119482233807581297|96.85|6.27|1.13|97|
|v03|https://x.com/jbiruna/status/2119442143110746414|82.43|6.05|1.05|82|
|v04|https://x.com/jbiruna/status/2119442063259500613|72.12|5.01|0.89|72|
|v05|https://x.com/jbiruna/status/2119442000663679319|58.07|4.40|0.80|58|
|v06|https://x.com/jbiruna/status/2119441827774513344|73.43|5.64|1.19|73|
|v07|https://x.com/jbiruna/status/2119360000665735226|96.15|6.40|1.23|96|
|v08|https://x.com/jbiruna/status/2119359941819646144|100.22|7.04|1.50|100|
|v09|https://x.com/jbiruna/status/2119359891550990508|97.66|7.70|1.90|98|
|v10|https://x.com/jbiruna/status/2119237299162714289|51.50|4.52|1.28|51|

Originals: `/workspace/pixel-tunnel/ref/v01.mp4` … `v10.mp4`. Small copies: `/workspace/pixel-tunnel/ref/small/v01.mp4` … `v10.mp4` (all <12MB; audio deliberately removed). Frames: `/workspace/pixel-tunnel/ref/frames/v01/` … `/v10/`, `sec-0001.jpg` represents ~0s, etc. Overview sheets: `ref/vNN-sheet.jpg`. Reward detail: `ref/v07-catch.png` and `frames/v07/detail-*.png`. Machine-readable sizes/dimensions: `ref/manifest.json`. Raw metadata/logs and `ref/post-texts.json` retained.

## v01 — Four separated colored chambers and cross-shaped connecting space
Post text: satisfying brick breaker https://t.co/FnRgMCiGhz
Palette: teal #2D766B / orange / olive / blue.

|Timestamp s|What is visible|Object position|Object size|Approximate color|Animation|Gameplay interpretation|Confidence|
|---|---|---|---|---|---|---|---|
|0|Four rectangular fields; yellow points in connecting lanes|four quadrants of upper field|each chamber roughly 23–24 cells wide; lanes ~2 cells|teal #2D766B / orange / olive / blue; white balls, grey borders, red paddle|Static grid|Multiple compartments/entrances, not a universal single-mouth layout|confirmed|
|34|Small jagged black patch at orange chamber edge|upper-right chamber, near central cross|several cells|teal #2D766B / orange / olive / blue; white balls, grey borders, red paddle|Patch expands on repeated ball contacts|Ordinary field material is destructible|confirmed|
|126|Many white balls; temporary long red horizontal bar|balls across field and lower zone; bar near bottom|bar approximately full playfield width|teal #2D766B / orange / olive / blue; white balls, grey borders, red paddle|Ball population increases; bar appears intermittently|Power-ups/multiball and temporary bottom protection likely|likely|
|160|Win dialog and three yellow stars|center of field|dialog ~half field width|teal #2D766B / orange / olive / blue; white balls, grey borders, red paddle|White particles/balls continue|Completion screen exists; exact completion rule not identified|confirmed|

## v02 — Small hook-like narrow tunnel entering olive field
Post text: https://t.co/UvNiQAxiQ1
Palette: olive #60602C.

|Timestamp s|What is visible|Object position|Object size|Approximate color|Animation|Gameplay interpretation|Confidence|
|---|---|---|---|---|---|---|---|
|0|Grey-edged stem/hook with yellow end|lower-left of upper field|interior ~2 cells; yellow ~1–2 cells|olive #60602C; white balls, grey borders, red paddle|Static tunnel; white ball below|Pre-existing route offers access to field|confirmed|
|7|Cyan drop near paddle; multiple white balls; red bottom bar|lower playfield|drop ~2–3 cells; paddle ~10 cells|olive #60602C; white balls, grey borders, red paddle|Drop falls; white balls disperse|Drop/paddle interaction likely produces multiball|likely|
|69|Black destruction blob grows above hook|lower-left field|~10–15 cells wide|olive #60602C; white balls, grey borders, red paddle|Jagged perimeter expands|Ball damage is not constrained to original tunnel|confirmed|
|96|Win panel over dense white particles|upper playfield|panel ~half field width|olive #60602C; white balls, grey borders, red paddle|Completion overlay|Three-star completion shown|confirmed|

## v03 — Branched stem with horizontal crossbar and side uprights
Post text: https://t.co/M32vfCo3x9
Palette: orange #DC7C3F.

|Timestamp s|What is visible|Object position|Object size|Approximate color|Animation|Gameplay interpretation|Confidence|
|---|---|---|---|---|---|---|---|
|0|Branching grey-edged dark lanes in orange material|center of upper grid, connected to bottom|lanes ~2 cells; branch spans ~24 cells|orange #DC7C3F; white balls, grey borders, red paddle|Static field|Branching routing puzzle|confirmed|
|12|Colored drops along left branch and below field|left upright and lower zone|drops ~2–3 cells|orange #DC7C3F; white balls, grey borders, red paddle|Drops move downward|Several colored power-up types, not only cyan|confirmed|
|17|Many white balls below field and full-width lower red bar|lower zone|bar near full width|orange #DC7C3F; white balls, grey borders, red paddle|Balls bounce separately|Temporary floor-like protection is likely|likely|
|69|Large right-side black destruction front|right upper field|~10 cells wide and growing|orange #DC7C3F; white balls, grey borders, red paddle|Material disappears around impacts|Ordinary cells break on ball interaction|confirmed|
|81|Most orange gone, white balls everywhere, no legible win panel yet|whole field|hundreds of visible white dots late|orange #DC7C3F; white balls, grey borders, red paddle|Destruction continues|End-of-clip completion UI not confirmed for this video|unknown|

## v04 — Circular chamber atop a narrow vertical stem
Post text: https://t.co/GU8qqeINE5
Palette: brown-orange #8F4F23.

|Timestamp s|What is visible|Object position|Object size|Approximate color|Animation|Gameplay interpretation|Confidence|
|---|---|---|---|---|---|---|---|
|0|Round dark chamber and narrow neck; yellow around rim|center-lower field|chamber ~12 cells diameter; neck ~2 cells|brown-orange #8F4F23; white balls, grey borders, red paddle|Static outline|A widened chamber can connect to narrow entry|confirmed|
|5|Green drop inside chamber|chamber lower-right edge|~2–3 cells|brown-orange #8F4F23; white balls, grey borders, red paddle|Falls downward|Additional colored reward exists|confirmed|
|56|Black region spreads outside circular chamber|above/right chamber|several cells|brown-orange #8F4F23; white balls, grey borders, red paddle|Jagged erosion expands|Walls are not universal red blocked borders|confirmed|
|71|Three-star win panel amid balls|center|~half field width|brown-orange #8F4F23; white balls, grey borders, red paddle|Completion overlay|Win after extensive field destruction, not demonstrably target-only|likely|

## v05 — Bent narrow stem leading diagonally up-left
Post text: https://t.co/NhUTUSjnLe
Palette: dark orange/brown (compressed texture varies).

|Timestamp s|What is visible|Object position|Object size|Approximate color|Animation|Gameplay interpretation|Confidence|
|---|---|---|---|---|---|---|---|
|0|Bent dark tunnel in a smaller inset field|center-lower field|interior ~2 cells|dark orange/brown (compressed texture varies); white balls, grey borders, red paddle|Static geometry|Angled/stepped route|confirmed|
|8|Several white balls below field|lower playfield|white dots <1 cell|dark orange/brown (compressed texture varies); white balls, grey borders, red paddle|Separate trajectories|Early multiball visible|confirmed|
|41|Colored drops near growing black patch|left of stem endpoint|drops ~2–3 cells|dark orange/brown (compressed texture varies); white balls, grey borders, red paddle|Downward motion|Drops coexist with cell erosion|confirmed|
|45|Full-width red-orange lower bar|bottom playfield|nearly full width|dark orange/brown (compressed texture varies); white balls, grey borders, red paddle|Temporary appearance|Different from requested short green auxiliary stick|confirmed|
|57|Win panel and dense particles|center field|small overlay|dark orange/brown (compressed texture varies); white balls, grey borders, red paddle|Completion effect|Completion visible|confirmed|

## v06 — Nested rectangular frame/loop with small top-centered entry
Post text: https://t.co/8xRqLmEjwb
Palette: orange inside grey frames.

|Timestamp s|What is visible|Object position|Object size|Approximate color|Animation|Gameplay interpretation|Confidence|
|---|---|---|---|---|---|---|---|
|0|Nested grey outlines around square orange interior; lane around outer rim|whole upper field; short top-center notch|frame/lane ~1–2 cells; interior ~40 cells square|orange inside grey frames; white balls, grey borders, red paddle|Static layout|Not a simple single bottom-to-target tunnel|confirmed|
|15|Cyan drop in orange interior|upper-middle field|~2–3 cells|orange inside grey frames; white balls, grey borders, red paddle|Falls down|Badge can appear within field, origin not established|confirmed|
|36|Large black patch from top center|top edge inward|~15 cells across|orange inside grey frames; white balls, grey borders, red paddle|Expanding front|Destruction may enter from top after routing around frame|likely|
|57|Multiball, colored drops and lower red line|field plus lower playfield|line almost full width|orange inside grey frames; white balls, grey borders, red paddle|Many independent balls|Late game far exceeds 12 visible white dots|confirmed|
|72|Tiny completion overlay|field center|small panel|orange inside grey frames; white balls, grey borders, red paddle|Overlay amid balls|End success likely, text too small in overview|likely|

## v07 — Two-turn stepped tunnel
Post text: https://t.co/iy3t6six0M
Palette: blue #3B4367.

|Timestamp s|What is visible|Object position|Object size|Approximate color|Animation|Gameplay interpretation|Confidence|
|---|---|---|---|---|---|---|---|
|0|Narrow stepped tunnel and yellow cap|mouth around col19–20; rightward then up|50x50 estimated grid; tunnel ~2 cells|blue #3B4367; white balls, grey borders, red paddle|Static grey walls; dark interior|Geometry resembles written zigzag direction, but must not copy exact layout|confirmed|
|7|Cyan +3 above red paddle|lower field, x~160 y~348 in 270x480 review frame|badge ~12px (~2.5 cells); paddle ~49x4px|blue #3B4367; white balls, grey borders, red paddle|Badge falling|Text +3 directly legible in single frame|confirmed|
|7.75|Several white balls emerge close to paddle after badge contact|lower playfield|white balls ~3px (~0.6 cell)|blue #3B4367; white balls, grey borders, red paddle|New trajectories fan near paddle|Paddle-origin multiplication likely; exact current-spot clone rule NOT verified|likely|
|27|Yellow cap no longer visibly yellow; small black tip|top tunnel endpoint|several cells|blue #3B4367; white balls, grey borders, red paddle|Play continues ~68 more seconds|Target-only win is not supported; cap may have changed state or been destroyed|likely|
|75|Jagged cavity, colored drops, many balls|upper-right around route|cavity >20 cells|blue #3B4367; white balls, grey borders, red paddle|Accelerating erosion|Multiball driven field clearing|confirmed|
|95|Three-star win screen|middle field|~half field width|blue #3B4367; white balls, grey borders, red paddle|Win overlay|Success occurs after extensive ordinary-material clearing|confirmed|

## v08 — H-like branching lanes
Post text: https://t.co/5FcD4mJePY
Palette: green #3E5F2A.

|Timestamp s|What is visible|Object position|Object size|Approximate color|Animation|Gameplay interpretation|Confidence|
|---|---|---|---|---|---|---|---|
|0|Two vertical routes joined horizontally; yellow tips|lower half of field|lanes ~2 cells; two bottom connections|green #3E5F2A; white balls, grey borders, red paddle|Static|More than one bottom mouth is visible|confirmed|
|14|Black patch at left top tip; cyan drops|left upper route|patch ~5 cells|green #3E5F2A; white balls, grey borders, red paddle|Impact erosion and falling drops|Destruction starts near a route endpoint|confirmed|
|42|Temporary full-width red lower bar|lower playfield bottom|almost full width|green #3E5F2A; white balls, grey borders, red paddle|Appears/disappears across clip|Not a 1.8x-width green follower in footage|confirmed|
|85|Both upper tips eroded and many balls|upper field|large black cavities|green #3E5F2A; white balls, grey borders, red paddle|Multiple trajectories|Branch-independent erosion|confirmed|
|99|Three-star win overlay|center|~half field width|green #3E5F2A; white balls, grey borders, red paddle|Dense white particles|Completion visible|confirmed|

## v09 — M-like branching lanes from central stem
Post text: https://t.co/ZObcBPpYjd
Palette: magenta #670B54.

|Timestamp s|What is visible|Object position|Object size|Approximate color|Animation|Gameplay interpretation|Confidence|
|---|---|---|---|---|---|---|---|
|0|Central entry forks into diagonal branches ending in downward legs|lower-middle field|lanes ~2 cells|magenta #670B54; white balls, grey borders, red paddle|Static; yellow leg endpoints|Branching path, not all targets at top|confirmed|
|48|Right yellow endpoint no longer bright; field mostly intact|right lower leg|1–2 cells at tip|magenta #670B54; white balls, grey borders, red paddle|Ball moves within route|No immediate target-hit win shown|likely|
|76|Dark cavities around both lower leg endpoints|left/right lower field|~10 cells across each|magenta #670B54; white balls, grey borders, red paddle|Field erodes|Ordinary destruction follows route breaches|confirmed|
|90|Large black area, hundreds of white dots, red lower bar|whole field|balls many more than 12|magenta #670B54; white balls, grey borders, red paddle|Rapid filling with trajectories|Far more than 12 balls are on screen. The build uses a configurable pool of 64, not a cap of 12|confirmed|
|97|Three-star win panel|center|~half field width|magenta #670B54; white balls, grey borders, red paddle|Completion overlay|Win visible|confirmed|

## v10 — Branched candelabrum-like channel with red central segment
Post text: https://t.co/e92PjoTCAt
Palette: dark brown #341912.

|Timestamp s|What is visible|Object position|Object size|Approximate color|Animation|Gameplay interpretation|Confidence|
|---|---|---|---|---|---|---|---|
|0|Stem, horizontal branch, multiple uprights; yellow tips and red central bar|center-lower field|lanes ~2 cells; red bar ~12 cells|dark brown #341912; white balls, grey borders, red paddle|Static geometry|Red appears inside puzzle, not universal border|confirmed|
|25|Cyan and orange drops near right side|right of stem, lower field|~2–3 cells|dark brown #341912; white balls, grey borders, red paddle|Fall toward paddle|Multiple drop types|confirmed|
|32|Many white balls below and black cavity above right upright|right half field|~10-cell cavity|dark brown #341912; white balls, grey borders, red paddle|Erosion expands|Right branch opens into destructible field|confirmed|
|39|Star-shaped yellow pickup and temporary bottom red line|lower-right playfield|star ~2–3 cells; line full width|dark brown #341912; white balls, grey borders, red paddle|Pickup falls|Other rewards beyond written cyan +3 exist|confirmed|
|50|Win panel with TWO stars visible|center field|~half field width|dark brown #341912; white balls, grey borders, red paddle|Completion overlay|Rating may vary; exact star criteria unknown|confirmed|

## Cross-video implementation summary
- **Grid:** approximately 50 columns × 50 rows in v07; a square upper material field and a lower black/dark free-play region. 400×616 is an implementation coordinate system, not verified native footage dimensions (most are 720×1280 including margins).
- **Tunnel:** dark interior approximately two cells across, light-grey pixel outlines around one cell thick. Existing lanes are visible from clip start. Jagged black cavities grow beyond the designed lanes as balls hit material.
- **Entrance:** v07 has a narrow bottom mouth around cols19–20 (zero-based approximate). H has two bottom mouths; framed layout routes around the outside. No universal green mouth or red blocked bottom wall is visible.
- **Paddle:** small red/salmon horizontal bar, v07 ~49×4 review pixels = roughly 10×0.8 cells, at y359, about 16 cells below material-field bottom. Lower free-play extends to ~405px. This is near written 9.5×0.75, but the exact 9.5-cell bottom offset is not established.
- **Ball:** white dots ~3 review pixels = ~0.6–0.8 cell diameter. Speed appears roughly tens of cells/sec (very low-confidence visual estimate); 210px/s at 8px/cell = 26.25 cells/sec is plausible, not measured/validated. Bounces and path aliasing defeat speed inference from 1fps. Exact launch angle, paddle response and wall restitution unknown.
- **Material:** stationary colored square pixels with dark gaps; ball impacts are associated with black jagged cavities. The precise damage radius, per-hit number of cells, and break cooldown are unknown.
- **Rewards:** cyan circular +3 is directly legible in v07 at ~7s; colored green/yellow/orange/pink drops and star-shaped drops also appear. Downward drop motion confirmed visually; top row2 random-column spawn, trigger combo, exact speed and 12sec interval unverified. A badge can be within field/tunnel before descending.
- **Multiball:** early few balls become very many independently moving white dots, ultimately far above twelve. v07 at7–8s shows +3 near paddle followed by extra balls fanning near the paddle; this favors a paddle-local spawn but does not establish exact frame-level origin/count. No evidence that every moving ball clones at its own position, nor exact 1→3→9 rule.
- **Safety bar:** temporary red/orange full-width horizontal line near lower boundary occurs in most clips. It does not resemble a short green 1.8× paddle-following stick. Its collision behavior, duration, reset rules and life immunity are not directly proven.
- **Completion:** v01/02/04/05/07/08/09/10 show win overlays after substantial material destruction; v10 appears two stars, most others three. v03 has no clearly readable end win panel; v06 tiny overlay likely success. Star criteria and exact win condition unknown.
- **Level families:** quadrant chambers, hook, branched crossbar, circular chamber/stem, bent stem, nested frame, stepped route, H-like branch, M-like branch, multi-upright branch. These are visual categories only. The 40 shipped layouts are original themes from the written list, not traces of these clips.

The decision table at the top is the build. Observations in the tables are what was visible. They are not a claim that PRISMBURST reproduces the clips.

