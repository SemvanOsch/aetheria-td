/**
 * The catalog files' source text, exactly as on disk when the editor loaded —
 * the same version the shipped content was built from (Vite `?raw` imports;
 * `npm run editor:check` loads them the same way).
 */

import levels from '@game/domain/levels.ts?raw';
import enemies from '@game/domain/enemies.ts?raw';
import units from '@game/domain/units.ts?raw';
import mastery from '@game/domain/mastery.ts?raw';
import type { SourceTexts } from './sourceExport';

export const SHIPPED_SOURCES: SourceTexts = { levels, enemies, units, mastery };
