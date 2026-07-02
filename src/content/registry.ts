/**
 * The cross-reference registry — the one spine the guide, the course, and the
 * future print export all hang from.
 *
 * Rules:
 *  - Every referenceable thing carries a stable SLUG; numbers are DERIVED from
 *    order at render time and never hand-typed (the old hand-numbered toc had
 *    duplicate chapter numbers — deriving makes that class of bug impossible).
 *  - Course lessons are the canonical exercises: `exerciseFor(lessonId)` gives
 *    the book-style number ("Exercise 4.1") shared by every surface.
 */

/** One part of the book, with its chapters in reading order. */
export interface GuidePart {
  title: string;
  chapters: { slug: string; title: string }[];
}

export const guideParts: GuidePart[] = [
  {
    title: 'Part I · The landscape',
    chapters: [
      { slug: 'ch-bowl', title: 'The bottom of a bowl' },
      { slug: 'ch-landscape', title: 'Loss is a landscape' },
      { slug: 'ch-shapes', title: 'When the bowl isn’t a bowl' }
    ]
  },
  {
    title: 'Part II · Walking downhill',
    chapters: [
      { slug: 'ch-derivative', title: 'How steep, exactly?' },
      { slug: 'ch-downhill', title: 'Which way is downhill?' },
      { slug: 'ch-step', title: 'One step of descent' },
      { slug: 'ch-gamma', title: 'The learning rate γ' },
      { slug: 'ch-curvature', title: 'The bend of the bowl' },
      { slug: 'ch-schedule', title: 'Scheduling the learning rate' }
    ]
  },
  {
    title: 'Part III · Descent in the real world',
    chapters: [
      { slug: 'ch-noise', title: 'Mini-batches & the S in SGD' },
      { slug: 'ch-optimizers', title: 'The optimizer family tree' },
      { slug: 'ch-generalize', title: 'Training loss isn’t the goal' }
    ]
  },
  {
    title: 'Part IV · The zoo',
    chapters: [
      { slug: 'ch-problems', title: 'The landscape zoo' },
      { slug: 'ch-experiments', title: 'Things to try' }
    ]
  },
  {
    title: 'Reference',
    chapters: [
      { slug: 'ch-panels', title: 'Reading the panels' },
      { slug: 'ch-keys', title: 'Keyboard' }
    ]
  }
];

/** Flat chapter list in reading order, with derived 1-based numbers. */
export interface ChapterEntry {
  slug: string;
  title: string;
  /** Derived chapter number as displayed ("1"…"14"). */
  n: string;
  part: string;
}

export const guideChapters: ChapterEntry[] = guideParts.flatMap(p =>
  p.chapters.map(c => ({ ...c, n: '', part: p.title }))
);
guideChapters.forEach((c, i) => (c.n = String(i + 1)));

/** Look up a chapter by slug (undefined for unknown slugs). */
export const chapterBySlug = (slug: string): ChapterEntry | undefined =>
  guideChapters.find(c => c.slug === slug);

export const isChapterSlug = (slug: string): boolean => !!chapterBySlug(slug);

/**
 * Chapters whose concept has a hands-on lesson in the guided course — the
 * chapter CTA jumps straight to that lesson. (Lesson ids live in lessons.ts;
 * a vitest cross-checks that every id here exists there.)
 */
export const chapterLesson: Record<string, string> = {
  'ch-shapes': 'trap',
  'ch-downhill': 'downhill',
  'ch-step': 'dead-gradient',
  'ch-gamma': 'step-size',
  'ch-noise': 'sgd-noise',
  'ch-optimizers': 'momentum-race'
};

/**
 * Canonical exercise numbering: lesson id → the chapter it belongs to, in
 * that chapter's exercise order. "Exercise <chapter>.<k>" is derived, so the
 * course, the guide CTAs, and the print export can all display one number.
 */
const chapterExercises: Record<string, string[]> = {
  'ch-shapes': ['trap', 'saddle'],
  'ch-downhill': ['downhill'],
  'ch-step': ['dead-gradient'],
  'ch-gamma': ['step-size'],
  'ch-noise': ['sgd-noise'],
  'ch-optimizers': ['momentum-race', 'narrow-valley', 'adam'],
  'ch-problems': ['tiny-net']
};

export interface ExerciseRef {
  lessonId: string;
  chapter: ChapterEntry;
  /** Book-style label, e.g. "Exercise 3.2". */
  label: string;
}

/** The canonical exercise reference for a course lesson, if it has one. */
export function exerciseFor(lessonId: string): ExerciseRef | undefined {
  for (const [slug, ids] of Object.entries(chapterExercises)) {
    const k = ids.indexOf(lessonId);
    if (k < 0) continue;
    const chapter = chapterBySlug(slug);
    if (!chapter) return undefined;
    return { lessonId, chapter, label: `Exercise ${chapter.n}.${k + 1}` };
  }
  return undefined;
}
