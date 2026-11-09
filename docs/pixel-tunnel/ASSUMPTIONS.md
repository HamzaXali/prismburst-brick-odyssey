# Pixel Tunnel assumptions

The video file named in the rebuild prompt (`108228.mp4`) was not attached. Everything below is a `[?]` value or a reading that the prompt left open. Confirmed measurements are in `js/pixel-tunnel/config.js` and are not repeated here as guesses.

The shipped app stays plain JavaScript under `js/pixel-tunnel/`. It does not add a TypeScript toolchain. Version stays **1.6.0 / versionCode 9** (the prompt's 1.5.0 / versionCode 8 is the Play closed-test build and is not used on this branch).

| Topic | Value used | Why |
| --- | --- | --- |
| Styles | 51 layouts | Style 1 is the olive pocket. Styles 2–51 each have a different pocket shape and field color. Clearing style N unlocks N+1. |
| Gray cells | `GRAY_BREAKABLE = false` | Ali overrode the video note. The outer ring, pocket walls, divider, and every gray cell on row 49 never break. A hit bounces. |
| Outer ring | Indestructible | Same rule as the pocket. Top row, both side columns, and the bottom gray row stay. |
| Win | Every olive, yellow, and red cell is open | Gray walls are not part of the clear. Dug cells are still flat `#181818`. |
| Dug cells | `#181818`, no new gray edge | Prompt. Open cells are drawn as a flat fill. |
| 1 px gap colour | Olive `#33350D`, gray `#4E4E4E` | The video was not available to sample. Gaps are the right and bottom pixel of each solid cell. |
| Ball already moving | Starts in the black zone, centred on entrance column 13, going straight up | The prompt does not give the start coordinate. There is no launch button. |
| Respawn | A new ball appears on the paddle, already moving up | `[L]` in the prompt. |
| Lives | 5 | Not stated. Hearts in the bottom band, and the rose bar, use this count. |
| Rose bar | Shrinks when the last ball is lost | `ROSE_BAR_MODE = "ball-loss"`. Extra balls falling while others remain do not empty the bar. The game is lost at 0. |
| Progress bar | `#C8C8C8`, width = destroyed / destructible | Grows from the left under the rose bar. |
| Paddle angle | Max 60° from vertical, from hit position | Prompt `[?]`. Speed stays 37.3 cells/s. |
| ×3 | Each current ball becomes 3, copies ±0.4 rad | `[L]`. Capped at 1000. |
| Heart | +1 life, never above 5 | `[L]`. |
| Drop chance | 0.02 on an olive cell | Prompt default. |
| Drop weights | +3 50%, safety 20%, ×3 20%, heart 10% | +3 is the most common. The split of the rest is not shown. |
| Yellow / red drops | Row 43 orange safety, row 44 cyan +3, row 45 lime ×3, red cell heart | Yellow and red always drop. The prompt saw orange then cyan from the first yellow breaks. Assigning by cell makes that visible no matter which cell is hit first. |
| Catch | Shrinks into the paddle over 0.18 s, then the effect applies | Prompt: the circle fades into the paddle. The duration is not given. |
| Safety bar | `#F06366`, 0.5 cell, full field width, on the bottom edge of the black zone, 3.8 s | Colour matches the paddle. The orange orb uses `#EE9B45`. |
| Stars | Always 3 on a win | Prompt default. |
| Score | 10 per olive cell, 100 per target | Not shown. Stored as the level best. |
| Next | Replays level 1 | Only one level exists. No further levels were invented. |
| Save ids | The save helper still accepts level ids it already stored | So an older mirror is not thrown away. The mode only builds level 1. |
| Gap between canvas rows | Field top 1.5 + 50 + 25 black + 9 band = 85.5 of 86 cells | The leftover half cell is frame colour at the bottom. |
