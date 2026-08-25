// ============================================================================
//  Adventurer's Journal — lore chapters
// ----------------------------------------------------------------------------
//  This is the single place to name (and later, write) the journal's chapters.
//  Rename titles freely, reorder them, or add/remove entries — the journal UI
//  reads straight from this list.
//
//  Unlocking: the first chapter (index 0) is the Introduction and is ALWAYS
//  unlocked. Every chapter after it unlocks when the player clears another
//  stage — after N stages cleared, chapters 0..N are readable. So to add a new
//  unlockable chapter, just append another entry here.
//
//  Lore: leave `body` empty for now; fill it in later. Empty bodies render a
//  "not yet written" placeholder in the reader.
// ============================================================================

export interface JournalChapter {
  /** Title shown in the chapter list and at the top of the reader page. */
  title: string;
  /** Lore text for this chapter. Leave '' until it's written. */
  body: string;
}

export const JOURNAL_CHAPTERS: JournalChapter[] = [
  { title: 'Introduction', body: '' },
  { title: 'Chapter I', body: '' },
  { title: 'Chapter II', body: '' },
  { title: 'Chapter III', body: '' },
  { title: 'Chapter IV', body: '' },
  { title: 'Chapter V', body: '' },
  { title: 'Chapter VI', body: '' },
  { title: 'Chapter VII', body: '' },
  { title: 'Chapter VIII', body: '' },
  { title: 'Chapter IX', body: '' },
  { title: 'Chapter X', body: '' },
  { title: 'Chapter XI', body: '' },
  { title: 'Chapter XII', body: '' },
  { title: 'Chapter XIII', body: '' },
  { title: 'Chapter XIV', body: '' },
  { title: 'Chapter XV', body: '' },
];

/**
 * How many chapters are unlocked, given the number of stages the player has
 * cleared. Always at least 1 (the Introduction), capped at the number of
 * authored chapters.
 */
export function unlockedChapterCount(stagesCleared: number): number {
  return Math.min(JOURNAL_CHAPTERS.length, 1 + Math.max(0, stagesCleared));
}
