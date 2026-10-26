# Kindle: streamer panel design brief

Feel: professional, calm, dark-first, themeable. Avoid the generic AI look: no purple-blue gradient washes, no glassmorphism blur, no emoji icons, no cards with a colored left border.

Layout
- One main column shaped like a stack. The active question card is on top and large. The next 2 or 3 questions peek out behind it, slightly smaller and offset (layered depth). The rest sit in a simple list below. Show a position indicator ("1 of 4").
- A small floating popover attached to the active card holds the actions: Show on screen, Mark answered, Skip, each with its keyboard hint.
- Right column: a separate "New in chat" card (newcomer greeting with a "Say hello" button), a theme selector, and options. Never put greetings inside a question card.

Card anatomy
- A tiny rounded accent dash (24x4px) above a big monospace vote count ("x6") with a small "votes" label under it. The dash color shows the heat tier: 1 vote, 2-3, 4-5, 6+. The number is always visible, so color is never the only signal.
- Then the question text, then small muted text with the languages (FR · EN · ES).
- Heat tier names, shown small next to the vote count: Spark (1), Ember (2-3), Flame (4-5), Blaze (6+).  

Surfaces
- Radius 16-20px, generous padding (24px), 1px subtle border, soft shadow.
- A faint line texture at 4-6% opacity on the active card (Cuisine: fine grain, Jeux: grid, Twitch: none).
- Primary buttons are high-contrast pills.

Themes (CSS variables: --bg, --surface, --surface-2, --border, --text, --text-muted, --accent, --heat-1..4). All dark.
- Twitch: bg #0E0E10, surface #1F1F23, accent #9146FF
- Cuisine: bg #1A1411, surface #2A201A, accent #E8643C
- Jeux: bg #0B0F14, surface #131A22, accent #7EE0C3
Text contrast at least 4.5:1 in every theme.

Type: Bricolage Grotesque for text, IBM Plex Mono for numbers.

Motion: 200ms slide when the active question changes. Respect prefers-reduced-motion and a "less animation" option.

Accessibility: real <button> elements, visible focus outlines, 44px minimum touch targets, keyboard shortcuts J/K (next/previous), Enter (show), R (answered).
