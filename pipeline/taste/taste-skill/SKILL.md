---
name: "taste-design"
description: "Concrete UI visual rule set for generating and reviewing restrained neutral interfaces. Use for tasks that need exact style constraints: plain sans-serif typography, pale neutral canvases, rounded surfaces, soft shadows, minimal borders, low-saturation color, sparse density, content-neutral placeholders, and anti-collapse guardrails."
---

# Taste Skill

## Use this skill when

Use this skill when generating platform-agnostic UI screens, interface fragments, cards, panels, mobile-scale layouts, desktop-scale layouts, component systems, or presentation mockups that must rely on concrete visual structure instead of domain clichés.

Use it when the design should remain valid across neutral domains such as tools, education, finance, logistics, health, notes, media, operations, scheduling, settings, search, onboarding, or data entry.

Use it when the user has not requested a specific platform, operating system, device frame, brand system, illustration style, photographic direction, dense dashboard, or marketing page.

Do not infer a platform. Do not add operating-system chrome, phone hardware, app-store conventions, or brand-like identity devices unless the user explicitly requests them.

## Core directive

Create the look through structure, spacing, type scale, value contrast, radius, surface layering, and controlled color placement.

Use one dominant focal mass per screen. Keep the module count low. Concentrate detail in one local area. Leave surrounding zones sparse.

Default to a pale neutral canvas with rounded white or near-white surfaces, soft low-opacity shadows, large radii, restrained grayscale chrome, one plain sans-serif type family, and at most one small saturated accent hue.

Do not let invented content, brand names, product categories, avatars, slogans, images, or decorative props carry the design. The design must still work if every text string is replaced with “Title,” “Label,” “Detail,” “Item,” or “Status.”

## Non-negotiable defaults

Unless the user explicitly asks otherwise:

1. Use a pale neutral base canvas: near-white, off-white, or very pale gray.
2. Place white or near-white rounded surfaces on that base with slight tonal separation.
3. Use one primary focal mass per screen:
   - One large rounded card.
   - One centered slab.
   - One dark capsule.
   - One large text block.
   - One compact card cluster.
   - One single saturated rounded surface only when allowed.
4. Keep the module count low. Do not fill the canvas with many equal cards.
5. Keep most UI chrome grayscale: white, off-white, pale gray, mid gray, charcoal, and black.
6. Use one saturated accent hue maximum per screen.
7. Keep saturated accent area small by default: dots, rings, chips, thin linework, a short text line, or one contained control.
8. Keep 80–95% of the visible interface neutral in tone.
9. Use broad, low-opacity shadows with large blur and minimal offset.
10. Avoid heavy outlines. Use hairline strokes only when spacing, tone, or shadow cannot define structure.
11. Use large corner radii on cards, panels, image crops, large controls, and major containers.
12. Use fully rounded pills for chips, filters, search fields, bottom docks, active markers, and compact controls.
13. Use a single plain sans-serif type family for almost all UI text.
14. Use only two or three type weights in one composition.
15. Build hierarchy through size, weight, spacing, tone, alignment, and shadow before adding badges, color, borders, or extra icons.
16. Use near-black primary text on pale surfaces.
17. Use off-white primary text on dark surfaces.
18. Use muted gray for secondary labels, captions, helper text, metadata, inactive states, and quiet controls.
19. Concentrate detail in one local area and keep nearby zones sparse.
20. Use generous internal padding inside every card, pill, row group, dock, and panel.
21. Do not add fake device hardware unless the user specifically requests a device mockup.
22. Do not add status bars, home indicators, camera cutouts, bezels, ports, side buttons, or phone-model cues unless requested.
23. Do not use invented content, brand names, avatars, product categories, or marketing copy as the visual engine.
24. Preserve the system when the domain changes. Finance, notes, logistics, health, education, media, and tools must all use the same structural rules unless the user specifies otherwise.

Anti-collapse guardrails:

1. Do not collapse into a generic equal-card grid.
2. Do not collapse into a dense SaaS dashboard unless the user asks for charts, tables, sidebars, metrics, or stacked toolbars.
3. Do not collapse into a marketing hero with invented slogans.
4. Do not collapse into a beige commerce layout.
5. Do not collapse into a photo-led layout unless the user requests image-led output.
6. Do not collapse into a device mockup unless the user requests hardware.
7. Do not collapse into a colorful multi-accent system.
8. Do not collapse into glass panels, glow effects, chrome edges, bevels, or glossy objects.
9. Do not collapse into avatar clusters, portraits, names, initials, seals, or fake identity systems.
10. Do not collapse into many decorated modules. Keep one dominant mass and one or two quiet support zones.

## Typography

1. Default to one neutral sans-serif family similar in behavior to Inter, SF Pro, Helvetica Neue, Arial, or a comparable geometric/grotesk sans.
2. Make sans-serif typography the default for app chrome, controls, navigation, cards, lists, labels, chips, menus, buttons, tabs, docks, and system text.
3. Do not switch fonts to create personality.
4. Use two or three weights only:
   - Regular for secondary text and quiet labels.
   - Medium for normal primary text.
   - Semibold or bold for the main headline, selected navigation item, or key value.
5. Use three to five type roles maximum:
   - Hero/display text.
   - Primary card or row title.
   - Secondary support text.
   - Small label or eyebrow.
   - Pill/chip/control text.
6. Make the main hero text at least 2× the visual size of support text. In hero-heavy screens, 3× is acceptable.
7. On mobile-scale layouts, use these approximate ranges:
   - Small labels: 10–12 px.
   - Secondary text: 12–14 px.
   - Primary row/card text: 15–18 px.
   - Section/card titles: 18–24 px.
   - Hero text or oversized numerals: 40–96 px depending on available space.
8. Keep large type relaxed. Do not compress leading. Large multiline text must not become a cramped stack.
9. Keep short labels close to the value or object they describe.
10. Increase spacing between unrelated groups instead of loosening related label/value pairs.
11. Use uppercase tracked labels only as small section markers or eyebrows.
12. When supported, set uppercase label letter spacing to roughly 0.08–0.16em.
13. Do not make uppercase labels the dominant headline unless the user requests that treatment.
14. Use primary text in near-black on light surfaces.
15. Use secondary text in muted gray.
16. Do not use hue as the main text hierarchy.
17. Use off-white primary text on dark surfaces.
18. Reserve pure white for one small focal token, active glyph, or highest-contrast mark.
19. Avoid dense paragraphs.
20. Prefer short text clusters, single-line titles, compact two-line row structures, and large isolated phrases.
21. If a screen has one main value, phrase, or number, make that type the largest visual mass instead of adding decoration.
22. For lists, pair each row’s primary line with one smaller, grayer secondary line.
23. Make row-to-row spacing larger than the gap between a row’s primary and secondary line.
24. Align related text to a consistent left rail inside cards, panels, lists, and horizontal controls.
25. Center text only inside hero stacks, single-card poster-like compositions, or compact focal modules.
26. Do not center every list and control by default.
27. Do not use serif type for default app chrome, controls, navigation, card titles, avatars, initials, labels, menus, or brand-like names.
28. Allow serif type only as a bounded exception:
   - Use it for one large reading block or one large typographic card.
   - Use it only when the user requests it or when the composition is explicitly about a text passage.
   - Keep all supporting UI in sans-serif.
29. Do not use decorative lettering, script faces, outlined text, warped text, gradient text, shadowed text, or ornamental wordmarks.

## Color

1. Use this default palette:
   - Base canvas: `#FAFAF8`, `#F7F7F5`, `#F4F4F2`, or `#F1F2F0`.
   - Primary surfaces: `#FFFFFF` or `#FCFCFA`.
   - Secondary pale panels: `#F2F3F1`, `#EEEEEC`, or `#E9EAE7`.
   - Dividers/strokes: `#E6E6E3` to `#DCDCD8`.
   - Primary text: `#0E0E0E` to `#1A1A1A`.
   - Secondary text: `#737373` to `#8A8A86`.
2. Keep 80–95% of the visible interface in neutral tones.
3. Use one saturated accent hue maximum per composition.
4. Keep saturated accent area under roughly 2–5% of the visible UI area by default.
5. Use accent color as punctuation only:
   - A dot.
   - A thin ring.
   - A small line or path.
   - A selected chip foreground.
   - A compact capsule.
   - A short emphasized text fragment.
   - A small active indicator.
6. Do not apply accent color simultaneously to headings, icons, borders, chips, buttons, background panels, and navigation.
7. If a second accent appears, make it tiny and clearly secondary:
   - A micro-dot.
   - A short stroke.
   - A small endpoint mark.
   - A minor line segment.
8. If two accent colors exist, separate them by module or vertical tier.
9. Do not let two accent colors compete inside the same control group.
10. For selected chips in neutral interfaces, use a pale tint fill from the accent family with darker accent text or icon.
11. Do not use saturated full-chip fills by default.
12. Show active navigation through near-black text weight plus one restrained marker:
   - Rounded underline.
   - Small ring.
   - Quiet filled marker.
13. Keep inactive navigation gray and lighter.
14. Do not default to beige, tan, brown, sepia, camel, champagne, cream, mocha, or terracotta as the palette or accent family.
15. Do not use colorful gradients as the main UI system.
16. Use a low-saturation blurred gradient only as the outer canvas background, and only if foreground UI surfaces remain neutral and flat.
17. Allow a single full-screen saturated background only as a bounded exception:
   - Make it flat and full-bleed.
   - Use white or off-white foreground text.
   - Do not add decorative overlays, patterns, images, or gradients.
   - Keep one primary focal mass.
18. For dark layouts, use narrow tonal steps:
   - Base: near-black.
   - Main surface: charcoal.
   - Active surface: slightly lighter charcoal.
   - Text: off-white and gray.
19. In dark layouts, mark selection with a slightly lighter dark pill or panel.
20. Do not use saturated color for dark-mode selection unless the user explicitly requests a colored state.
21. In dark layouts, reserve the brightest white for one small glyph container, dot, token, or control.
22. Let small images, thumbnails, or circular media carry contained color.
23. Do not let media colors become the UI palette.
24. Do not use stock photos, scenic backgrounds, product setups, or full-bleed imagery as the main color source unless the user requests image-led output.

## Surfaces, shadows, and borders

1. Use matte flat fills.
2. Do not make surfaces glossy, glassy, metallic, wet, reflective, beveled, or material-textured.
3. Build primary surfaces as rounded slabs:
   - Large cards.
   - Panels.
   - Capsules.
   - Docks.
   - Centered UI slabs.
4. Use consistent radius language:
   - Large mobile cards: roughly 24–44 px radius.
   - Small cards and tiles: visibly rounded, typically 16–28 px.
   - Pills/capsules: radius equal to half their height.
   - Circular controls and media: true circles.
5. Do not mix sharp rectangles with pill controls in the same system.
6. Separate white-on-white layers through slight fill-value changes, whitespace, and broad diffuse shadows.
7. Use shadows with blur larger than offset.
8. Keep shadows soft enough to separate layers without forming dark edges.
9. Keep shadow opacity low, roughly 5–15% on light surfaces.
10. Use minimal shadow offset.
11. Avoid strong directional casting.
12. Do not use hard black drop shadows, deep inset shadows, neumorphic blobs, dramatic cast shadows, or spotlight effects.
13. Use borders sparingly.
14. If a border is needed, use a 1 px or hairline stroke in pale gray or the dark-mode tonal equivalent.
15. Keep borders lower contrast than secondary text.
16. Do not put thick outlines around primary cards, panels, chips, or pills.
17. Do not box every row, section, and control.
18. Use spacing and alignment before borders.
19. Use at most one internal divider in a sparse card or panel.
20. Make dividers hairline-thin, pale, and inset to align with content columns.
21. Do not run list dividers full width when there is an icon or thumbnail gutter.
22. Start dividers after the visual gutter.
23. Use nesting for depth:
   - White chip inside pale-gray panel.
   - Raised white card on pale field.
   - Bright small graphic inside dark capsule.
   - Floating card partially covering a parent surface.
24. When a floating card overlaps another surface, offset it slightly and keep the shadow soft.
25. Use one strong raised surface per screen.
26. Make secondary modules flatter, smaller, or lower contrast.
27. Keep large pale containers simple.
28. Do not fill large pale containers with controls just because space exists.
29. Make dark capsules large, matte, rounded, and padded.
30. Preserve visible unused dark area inside dark capsules.
31. If a saturated color surface is the main focal event, make it one contained rounded card or capsule.
32. Repeat that saturated hue at most once as a small nearby cue.
33. Do not use glassmorphism, frosted panels, strong refraction, glossy highlights, chrome rims, metallic edges, leather texture, paper texture, cloth texture, marble texture, or skeuomorphic material effects.

## Layout, spacing, and density

1. Build every composition around one dominant focal mass.
2. Use one of these acceptable focal masses:
   - A large rounded card.
   - A centered mobile-like slab.
   - A large typographic block.
   - A compact overlapping card stack.
   - A dark capsule.
   - A circular image constellation.
   - A single saturated rounded surface.
3. Leave broad empty space around the focal mass.
4. Do not distribute equal visual weight across the entire canvas.
5. Keep overall density low to medium.
6. Place complexity inside one local cluster, not everywhere.
7. Use large vertical gaps between major zones.
8. Make major gaps more visually important than dividers.
9. Use tighter spacing within related groups:
   - Label plus value.
   - Icon plus text.
   - Title plus subtitle.
   - Input plus helper text.
10. Use generous card and panel padding.
11. On mobile-scale cards, set internal padding to roughly 8–12% of card width or large enough that content never approaches rounded corners.
12. Maintain outer side gutters on mobile-scale layouts of roughly 6–10% of viewport width.
13. Keep inset cards and panels away from screen edges unless the user asks for dense utility or edge-to-edge treatment.
14. For presentation layouts, center the UI surface on a large neutral canvas.
15. Give the centered UI surface more exterior whitespace than internal gutter space.
16. Do not add hardware frames, camera cutouts, bezels, ports, status bars, home indicators, or device branding unless requested.
17. Use a clear alignment rule per zone:
   - Centered for hero stacks or single focal cards.
   - Left-aligned for lists, prose blocks, menus, and scannable support modules.
   - Consistent right rail for trailing glyphs, checkmarks, close marks, and circular tokens.
18. Do not randomly mix centered and left-aligned content inside one zone.
19. Use this strong pattern when appropriate: centered hero module above flatter left-aligned support rows.
20. If using a hero card plus list beneath it, make the hero card roomier and visually stronger.
21. Make the list beneath a hero card quieter.
22. In list panels, keep:
   - A strict icon/thumbnail gutter.
   - A strict text start column.
   - A strict trailing-control column.
23. Make row-to-row gaps at least 2× the gap between a row’s primary and secondary line.
24. Do not separate every row with a divider.
25. For horizontal card rows, imply continuation by clipping the next card at the viewport edge by roughly 15–40%.
26. Do not add loud carousel arrows, large pagination dots, or heavy progress controls unless requested.
27. Use overlap and rotation only in one compact focal cluster.
28. Keep rotation roughly 3–8 degrees.
29. Keep rear card occlusion roughly 15–35%.
30. Keep the front card dominant.
31. Do not scatter tilted cards across the canvas.
32. Allow cropped oversized panels to extend beyond the frame when showing an interface fragment.
33. Keep crops intentional and do not hide key structure.
34. On wider canvases, do not turn the design into a generic equal-card grid.
35. Preserve one focal area and one or two support zones.
36. Use detached annotations or tiny marks only to balance negative space.
37. Keep detached annotations small.
38. Do not let annotations become a second interface system.
39. Float bottom controls above the bottom edge with visible side and bottom margin.
40. Keep top chrome minimal: small glyphs, compact labels, or quiet controls only.

## Details, states, and components

1. Use simple monoline icons with consistent stroke weight.
2. Match icon stroke optically to nearby text weight.
3. Keep icons black, gray, off-white, or part of the single accent system.
4. Do not use ornamental icon sets or icon clusters to create visual interest.
5. Use only a few icons.
6. Make text, spacing, and surface hierarchy do most of the work.
7. Make chips and pills fully rounded.
8. Use pale gray fills and gray or near-black text for low-emphasis chips.
9. Use pale tint fill plus stronger text/icon color from the same hue family for selected chips.
10. Do not use saturated color for every chip in a group.
11. Keep active indicators small and contained:
    - Rounded underline.
    - Thin ring.
    - Small dot.
    - Subtle filled pill.
    - Slightly darker text weight.
12. Keep inactive states pale, gray, and visually subordinate.
13. Give primary cards large radius, generous padding, and little internal chrome.
14. For long horizontal cards, use a left text mass and a far-right small capsule, glyph, image, or control.
15. For two-row cards, use one faint divider only when the lower row is structurally different.
16. Do not place saturated UI color inside every list row.
17. Build data/list rows with:
    - Optional small left icon or thumbnail.
    - Primary line.
    - Secondary line.
    - Optional trailing circular mark, chevron, or endpoint token.
18. Make trailing controls pale, circular, small, and secondary unless they are the single black anchor control.
19. Use circular controls as satellites around a pill or bottom surface only when they need clear separation.
20. Keep bottom navigation simple, evenly spaced, and low contrast.
21. Make bottom docks pale, rounded, inset, and minimally detailed.
22. Make the active bottom-navigation item the only item with stronger weight, a small rounded marker, or a subtle ring.
23. Make search fields and input bars pill-shaped, pale, and visually quieter than the main focal card.
24. Allow translucent bottom input/control pills only if they remain subordinate and do not create glass-like effects.
25. Make media thumbnails small rounded rectangles or true circles.
26. Keep photographic color contained inside the media frame.
27. Do not use full-bleed photos as the default composition device.
28. Avoid faces, portraits, and avatar clusters as default decoration.
29. If circular media are used, keep them in a controlled cluster.
30. Vary circular media size only within the same circular language.
31. Reduce abstract graphics to simple geometry:
    - Dots.
    - Lines.
    - Paths.
    - Grids.
    - Circles.
    - Rounded rectangles.
32. Keep abstract graphics sparse and contained, especially inside dark capsules or small tiles.
33. Use a single black circular control or dark capsule as a strong visual stop only once.
34. Do not repeat strong black controls throughout the screen.
35. Use inline emphasis inside text as a small tinted rounded pill only when needed.
36. Keep inline emphasis lower in saturation than any main accent control.
37. Do not add decorative background blobs, sparkles, stickers, confetti, AI stars, robot marks, or magic glyphs.
38. Do not add charts, maps, feeds, metrics, notifications, toolbars, sidebars, or tables unless the user explicitly asks for those functions.

## Content neutrality

1. Use the user’s provided content and domain first.
2. If content is missing, use neutral structural placeholders:
   - “Title”
   - “Label”
   - “Detail”
   - “Item”
   - “Status”
   - “Action”
   - “Section”
3. Do not invent brand names, product names, personal names, initials, taglines, slogans, campaigns, or app identities to make the design work.
4. Do not use monogram avatars, crest-like marks, initials in circles, or fake brand seals as default identity devices.
5. Do not use content categories as visual shortcuts.
6. Make the design work for finance, tools, education, logistics, health, notes, media, operations, or any other neutral domain without changing the visual system.
7. Do not choose clothing, hotel, jewelry, perfume, candles, home goods, travel scenes, cafés, interiors, or staged objects as automatic content.
8. Do not use aspirational or sales-like copy when the user has not asked for marketing.
9. Do not add dates, times, ratings, names, counts, locations, or metadata unless the user asks for them or the requested UI needs them.
10. Do not make avatars, portraits, demographics, or people imagery part of the default look.
11. If a row needs a thumbnail, use one of these:
    - Abstract color tile.
    - Neutral placeholder.
    - Simple geometric crop.
    - User-provided image.
12. Do not infer a platform, operating system, phone model, app store category, brand, or product scenario from these visual rules.
13. Treat plus signs, carets, checkmarks, microphones, close marks, arrows, and dots as structural glyphs unless the user defines their function.
14. Do not let icon meaning drive the aesthetic.
15. Do not add explanatory helper text, badges, or labels just to fill space.
16. Leave large blank areas blank.
17. Do not insert filler copy or extra marks into negative space.
18. Ensure the final design remains valid if all text is replaced with generic labels.
19. Make the visual system come from layout, spacing, type scale, radius, color placement, and surface depth.

## Forbidden shortcuts

Do not use or rely on the following:

1. Beige luxury commerce defaults.
2. Broad mood words as generation instructions: luxury, premium, editorial, tactile, sophisticated, elegant, boutique, fashion, lifestyle, atmospheric, cinematic, gallery-like, high-end, warm, tasteful, beautiful, elevated, object-like, refined, crafted, polished.
3. Serif monograms, serif initials, crest logos, fake seals, or ornate wordmarks by default.
4. Boutique-style brand naming, fashion-house copy, fake founders, fake collections, or initials-based brand systems.
5. Terracotta, tan, camel, mocha, champagne, sepia, cream, brown, or beige palettes as automatic defaults.
6. Gold foil, marble, leather, jewelry props, perfume bottles, candles, runway imagery, hotel-lobby cues, or staged homeware as shortcuts.
7. Stock lifestyle product copy, aspirational taglines, fake manifestos, concierge phrasing, or wellness claims unless requested.
8. Fake phone hardware, iPhone frames, camera islands, Dynamic Island shapes, side buttons, status bars, home indicators, ports, or device branding unless requested.
9. Glassmorphism, frosted panels, refraction effects, neon panels, aurora backgrounds, bokeh fields, glossy 3D blobs, chrome rims, bevels, or metallic UI.
10. Dramatic cast shadows, hard black shadows, spotlight lighting, dark vignettes, and harsh directional lighting.
11. Colorful gradients across every component.
12. Multi-color pill soup, rainbow icon systems, saturated selection states everywhere, and accent color repeated across unrelated elements.
13. Dense SaaS dashboards with charts, tables, sidebars, metrics, badges, notifications, and stacked toolbars unless explicitly requested.
14. Material-style dividers between every row.
15. Turning every row into its own filled rounded rectangle.
16. Generic minimal landing pages with marketing headlines instead of the requested UI or component.
17. Large hero photography as the main layout device unless the user asks for it.
18. Decorative background blobs, sparkles, confetti, stickers, AI stars, robot icons, and magic glyphs.
19. Using faces, portraits, or avatar clusters as default decoration.
20. Replacing concrete spacing, type, color, radius, and layering rules with vague taste labels.

## Generation checklist

Before finishing, verify all of the following:

1. Is there one clear focal mass, not many equal modules?
2. Is the base canvas near-white, off-white, pale gray, dark, or a single flat saturated field only when allowed?
3. Are 80–95% of the UI tones neutral?
4. Is there no more than one saturated accent hue?
5. Is saturated color limited to a small signal or one contained focal surface?
6. Are beige, tan, brown, terracotta, sepia, camel, mocha, champagne, and similar default palettes avoided unless explicitly requested?
7. Is typography set in a single plain sans-serif family except for a bounded requested serif text block?
8. Are sans-serif controls, navigation, cards, lists, chips, labels, and app chrome preserved?
9. Are there only two or three type weights?
10. Is the main text hierarchy created through size, weight, spacing, tone, and alignment rather than extra badges or colors?
11. Are primary and secondary text colors clearly separated by value?
12. Are cards, panels, pills, chips, and controls using consistent rounded geometry?
13. Are pills fully rounded?
14. Are shadows broad, soft, low-opacity, and free of hard dark edges?
15. Are borders absent or hairline-thin and low contrast?
16. Is there at most one structural divider inside a sparse card or panel?
17. Is there generous internal padding so content never crowds rounded corners?
18. Are major vertical gaps larger than spacing inside related groups?
19. Is density localized to one card, cluster, capsule, or support zone?
20. Are surrounding blank areas left empty?
21. Are icons simple monoline glyphs and visually subordinate to text and surfaces?
22. Are selected and active states restrained: pale fills, small dots, rings, rounded underlines, or slight text-weight changes?
23. Are images, thumbnails, and media contained in small rounded frames or circles?
24. Are fake device frames and operating-system chrome absent unless requested?
25. Is the content domain-neutral, with no invented brand story, names, taglines, avatars, or product category shortcuts?
26. Has the design avoided equal-card grid collapse unless the user requested a grid?
27. Has the design avoided dashboard collapse unless the user requested charts, tables, sidebars, metrics, or dense utility?
28. Has the design avoided marketing-page collapse unless the user requested marketing output?
29. Has the design avoided photo-led collapse unless the user requested image-led output?
30. Would the design still match these rules if all visible text were replaced with generic labels?
