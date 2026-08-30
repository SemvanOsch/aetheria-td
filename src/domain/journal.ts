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
//
//  Paging: a chapter's `body` is split into reader pages the player turns
//  through (rather than one long scrolling page). Put a line containing only
//  `~~~` between two blocks of text to force a new page there — see PAGE_BREAK
//  and `chapterPageTexts` below.
// ============================================================================

export interface JournalChapter {
  /** Title shown in the chapter list and at the top of the reader page. */
  title: string;
  /** Lore text for this chapter. Leave '' until it's written. */
  body: string;
}

/**
 * A line an author puts on its own between two blocks of a chapter `body` to
 * force a page break in the reader. The text before it and after it become
 * separate pages the player turns through.
 */
export const PAGE_BREAK = '~~~';

export const JOURNAL_CHAPTERS: JournalChapter[] = [
  {
    title: 'Introduction',
    body: `They tell me Aetheria was once the fairest kingdom the world had ever known. I have only the old songs and my grandmother's stories to go by, but I believe every word of them. Towers that caught the dawn before the mountains did. Rivers clear enough to read the sky in. Fields so generous that no child in the realm ever went to bed hungry.

~~~

We were never a kingdom that needed to be feared. We were loved, and I have come to think that love was a strength all its own. Scholars crossed oceans just to sit in our libraries, and our people walked beneath banners of gold and blue with their heads held high. I was born too late to see any of it, and I grieve for that more than I can say.

~~~

Then, two years ago, King Kael took the throne, and everything began to change. The old kings had been content to tend the realm like a garden. His gaze turned outward instead, hungry and cold, and almost overnight the whole kingdom caught the fever with him. It was no longer enough to be at peace. We had to expand, to claim, to conquer the lands beyond our borders.

~~~

So we marched to war for ground that was never ours. Fewer of us came home with each passing season, and grief arrived in their place. The fields emptied of the hands that once worked them. The treasury was poured out for iron and blood. Even the clear rivers ran grey. In two short years, the fairest kingdom in the world had been brought to its knees.

~~~

And then, in the quiet before sleep, something spoke to me. The Voice of the World, it named itself, and it called me a Hero, one of the rare souls born to turn the tide of an age. The power it promised still stirs faintly in me, half awake and untested. I have told no one, not yet. A gift I do not yet understand is better kept close than boasted about.

~~~

So I have done the only thing someone like me can do. I have gathered a party, a handful of souls I would trust with my life, and who would trust me with theirs. Tomorrow we set out for the capital, for the castle at its heart, and for the king whose reign has bled this kingdom white. Whatever waits behind those gates, I mean to end this war and give Aetheria back the dawn it lost.`,
  },
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

/**
 * The reader pages of a chapter: its `body` split on {@link PAGE_BREAK} markers
 * into one trimmed string per page (blank pages dropped). An unwritten chapter
 * returns `[]`, so the reader can substitute its "not yet written" placeholder.
 */
export function chapterPageTexts(index: number): string[] {
  const body = JOURNAL_CHAPTERS[index]?.body.trim();
  if (!body) return [];
  return body
    .split(/\n\s*~~~\s*\n/)
    .map((page) => page.trim())
    .filter(Boolean);
}
