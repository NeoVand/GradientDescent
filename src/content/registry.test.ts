import { describe, it, expect } from 'vitest';
import { guideParts, guideChapters, chapterBySlug, chapterLesson, exerciseFor } from './registry';
import { chRefs } from './chapterRefs';
import { lessons } from '../utils/lessons';
import { experiments, chapterPresets } from '../utils/experiments';

describe('registry', () => {
  it('derives unique, sequential chapter numbers', () => {
    const ns = guideChapters.map(c => c.n);
    expect(new Set(ns).size).toBe(ns.length);
    expect(ns).toEqual(guideChapters.map((_, i) => String(i + 1)));
  });

  it('has unique slugs and a chapter for every part entry', () => {
    const slugs = guideChapters.map(c => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    const fromParts = guideParts.flatMap(p => p.chapters.map(c => c.slug));
    expect(fromParts).toEqual(slugs);
  });

  it('maps every chapter lesson to a real lesson and a real chapter', () => {
    const lessonIds = new Set(lessons.map(l => l.id));
    for (const [slug, lessonId] of Object.entries(chapterLesson)) {
      expect(chapterBySlug(slug), `unknown chapter slug ${slug}`).toBeDefined();
      expect(lessonIds.has(lessonId), `unknown lesson id ${lessonId}`).toBe(true);
    }
  });

  it('numbers every course lesson as a canonical exercise', () => {
    for (const l of lessons) {
      const ref = exerciseFor(l.id);
      expect(ref, `lesson ${l.id} has no exercise number`).toBeDefined();
      expect(ref!.label).toMatch(/^Exercise \d+\.\d+$/);
    }
  });

  it('keys every chapter preset and further-reading list by a real slug', () => {
    for (const slug of Object.keys(chapterPresets)) {
      expect(chapterBySlug(slug), `chapterPresets key ${slug}`).toBeDefined();
    }
    for (const slug of Object.keys(chRefs)) {
      expect(chapterBySlug(slug), `chRefs key ${slug}`).toBeDefined();
    }
  });

  it('gives experiments unique ids', () => {
    const ids = experiments.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
