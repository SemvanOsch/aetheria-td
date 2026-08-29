# public/ static assets

Files here are served at the site root by Vite (e.g. `public/foo.png` → `/foo.png`).

## cyclone_slash.png
The Blade adventurer's **Cyclone Slash** ability icon (square works best — it's
shown in a circular button on the right of the battle screen). If this file is
missing the icon falls back to a 🌀 emoji automatically. The path is referenced
from `domain/playerChampion.ts` (`ability.image`).
