# Cortana persona PERS asset inventory

**Source:** user-supplied immutable Microsoft Cortana Android 3.3.3.2876 APK.
**APK SHA-256:** `c8c3192bc29057dfc398f4cb8fa3bfc549422373e0688a4c6de993f37a233d6c`
**Inspection:** PERS container header and embedded GIF payload metadata; no source APK files modified.
**Inventory:** 48 PERS files; 1846 embedded GIF frames; 2,502,596 bytes of PERS containers.

| Asset | PERS bytes | Frames | GIF dimensions |
|---|---:|---:|---:|
| `circle_abashed1-100.pers` | 27,034 | 72 | 100×116 |
| `circle_alert1-100.pers` | 44,636 | 10 | 214×249 |
| `circle_audio1-100.pers` | 65,687 | 7 | 100×116 |
| `circle_bouncy1-100.pers` | 38,635 | 34 | 214×249 |
| `circle_calm1-100.pers` | 118,653 | 21 | 100×116 |
| `circle_considerate1-100.pers` | 50,018 | 12 | 214×249 |
| `circle_elated1-100.pers` | 37,467 | 34 | 214×249 |
| `circle_greeting1-100.pers` | 25,251 | 40 | 100×116 |
| `circle_greeting2-100.pers` | 24,029 | 39 | 100×116 |
| `circle_greeting3-100.pers` | 47,872 | 39 | 214×249 |
| `circle_greeting4-100.pers` | 61,511 | 37 | 214×249 |
| `circle_lightning1-100.pers` | 11,322 | 8 | 428×500 |
| `circle_listening1-100.pers` | 29,269 | 10 | 100×116 |
| `circle_needmore1-100.pers` | 151,341 | 18 | 214×249 |
| `circle_oobeintro1-100.pers` | 38,404 | 100 | 214×249 |
| `circle_optimistic1-100.pers` | 62,918 | 9 | 214×249 |
| `circle_reminder1-100.pers` | 43,556 | 12 | 214×249 |
| `circle_satisfied1-100.pers` | 33,839 | 34 | 214×249 |
| `circle_sensitive1-100.pers` | 37,208 | 48 | 214×249 |
| `circle_siri1-100.pers` | 81,410 | 63 | 214×249 |
| `circle_speaking1-100.pers` | 51,335 | 10 | 100×116 |
| `circle_sunny1-100.pers` | 93,456 | 34 | 428×500 |
| `circle_thinking1-100.pers` | 12,910 | 28 | 100×116 |
| `miantuan_abashed1-100.pers` | 49,523 | 15 | 214×249 |
| `miantuan_alert1-100.pers` | 33,383 | 1 | 214×249 |
| `miantuan_audio1-100.pers` | 56,165 | 24 | 214×249 |
| `miantuan_blink1-100.pers` | 29,450 | 40 | 214×249 |
| `miantuan_bouncy1-100.pers` | 41,302 | 40 | 214×249 |
| `miantuan_calm1-100.pers` | 29,531 | 40 | 214×249 |
| `miantuan_considerate1-100.pers` | 55,442 | 1 | 214×249 |
| `miantuan_elated1-100.pers` | 45,667 | 40 | 214×249 |
| `miantuan_greeting1-100.pers` | 26,539 | 40 | 214×249 |
| `miantuan_greeting2-100.pers` | 31,254 | 40 | 214×249 |
| `miantuan_greeting3-100.pers` | 32,178 | 40 | 214×249 |
| `miantuan_heart1-100.pers` | 106,059 | 130 | 214×249 |
| `miantuan_holiday1-100.pers` | 164,928 | 140 | 214×249 |
| `miantuan_listening1-100.pers` | 80,964 | 6 | 214×249 |
| `miantuan_look1-100.pers` | 28,769 | 40 | 214×249 |
| `miantuan_needmore1-100.pers` | 53,159 | 15 | 214×249 |
| `miantuan_oobeintro1-100.pers` | 52,310 | 120 | 214×249 |
| `miantuan_optimistic1-100.pers` | 39,165 | 40 | 214×249 |
| `miantuan_reminder1-100.pers` | 38,790 | 40 | 214×249 |
| `miantuan_satisfied1-100.pers` | 38,174 | 40 | 214×249 |
| `miantuan_sensitive1-100.pers` | 47,261 | 15 | 214×249 |
| `miantuan_siri1-100.pers` | 76,193 | 100 | 214×249 |
| `miantuan_speaking1-100.pers` | 57,070 | 40 | 214×249 |
| `miantuan_thinking1-100.pers` | 71,356 | 40 | 214×249 |
| `miantuan_wink1-100.pers` | 30,203 | 40 | 214×249 |

## Decoder observations

Each inspected PERS file begins with the `PERS` signature and a little-endian XML metadata length. The XML declares an embedded GIF offset, byte size, and frame count. For all 48 assets, the declared GIF frame count matched the actual GIF frame count decoded by Pillow.

This inventory does not yet map each animation to a Cortana runtime state, timing policy, transition, or UI scale. Preserve original dimensions; the 100×116 and 214×249 assets are not interchangeable without inspecting their intended render scale. The 428×500 asset is also present.

## Handling constraints

- Keep the original APK immutable and out of Git.
- This document records metadata only; do not commit extracted proprietary GIF payloads without an explicit distribution/licensing review.
- Reconcile this complete 48-file inventory with earlier partial extraction notes before replacing historical checkpoint statements.
