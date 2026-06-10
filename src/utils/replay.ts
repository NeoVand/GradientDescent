/**
 * Run export: replay the descent on an offscreen canvas and record it to
 * a WebM video — drop the file straight into slides.
 *
 * The 2D landscape is rebuilt in canvas form (heatmap image + contour
 * lines + fading trail + marker + step counter), the history is compressed
 * to ≤ 240 frames at 30 fps (≤ 8 s), and canvas.captureStream feeds a
 * MediaRecorder. No DOM, no SVG rasterization — just drawImage and paths.
 */

import { contours } from 'd3-contour';
import type { TrainingHistoryPoint } from '../types/types';
import type { LossScene } from '../stores/stores';

const SIZE = 1080;
const MARGIN = 70;
const FPS = 30;
const MAX_FRAMES = 240;
// Hold the final frame for a beat so the video doesn't cut on arrival.
const TAIL_HOLD_FRAMES = 24;

export function canExportVideo(): boolean {
  return (
    typeof window !== 'undefined' &&
    'MediaRecorder' in window &&
    typeof HTMLCanvasElement !== 'undefined' &&
    'captureStream' in HTMLCanvasElement.prototype
  );
}

function pickMimeType(): string {
  for (const t of ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

export interface ReplayOptions {
  scene: LossScene;
  history: TrainingHistoryPoint[];
  problemName: string;
  isDark: boolean;
}

/** Render + record; resolves once the .webm download has been triggered. */
export async function exportRunWebM({ scene, history, problemName, isDark }: ReplayOptions): Promise<void> {
  if (history.length < 2) throw new Error('nothing to replay');

  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;

  const heatmap = await loadImage(scene.imageURL);

  const { range, grid } = scene;
  const span = range.max - range.min;
  const plotW = SIZE - 2 * MARGIN;
  const X = (a: number) => MARGIN + ((a - range.min) / span) * plotW;
  const Y = (b: number) => MARGIN + (1 - (b - range.min) / span) * plotW;

  // Contour paths, computed once in grid space then mapped to pixels.
  const extSpan = grid.extMax - grid.extMin;
  const gx = (cx: number) => X(grid.extMin + (cx / grid.res) * extSpan);
  const gy = (cy: number) => Y(grid.extMin + (cy / grid.res) * extSpan);
  const contourPaths: Path2D[] = contours()
    .size([grid.res, grid.res])
    .smooth(true)
    .thresholds(grid.thresholds)(grid.values as unknown as number[])
    .map(c => {
      const p = new Path2D();
      for (const polygon of c.coordinates) {
        for (const ring of polygon) {
          ring.forEach(([cx, cy], i) => {
            if (i === 0) p.moveTo(gx(cx), gy(cy));
            else p.lineTo(gx(cx), gy(cy));
          });
          p.closePath();
        }
      }
      return p;
    });

  const bg = isDark ? '#060913' : '#ffffff';
  const frameColor = isDark ? '#527a75' : '#064e3b';
  const textColor = isDark ? '#cbd5e1' : '#334155';

  const replayFrames = Math.min(MAX_FRAMES, history.length);
  const idxFor = (f: number) =>
    Math.min(history.length - 1, Math.round((f / Math.max(1, replayFrames - 1)) * (history.length - 1)));

  function drawFrame(f: number) {
    const hi = idxFor(f);

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Heatmap over its extended range, clipped to the plot frame
    ctx.save();
    ctx.beginPath();
    ctx.rect(MARGIN, MARGIN, plotW, plotW);
    ctx.clip();
    ctx.drawImage(heatmap, X(grid.extMin), Y(grid.extMax), X(grid.extMax) - X(grid.extMin), Y(grid.extMin) - Y(grid.extMax));

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1.5;
    for (const p of contourPaths) ctx.stroke(p);

    // Fading trail up to this frame (same look as the live view)
    const upTo = history.slice(Math.max(0, hi - 99), hi + 1);
    for (let i = 0; i < upTo.length - 1; i++) {
      const progress = i / Math.max(1, upTo.length - 1);
      ctx.strokeStyle = '#ef4444';
      ctx.globalAlpha = 0.05 + progress * 0.75;
      ctx.lineWidth = (2 + progress * 10) * (SIZE / 560);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(X(upTo[i].parameters.a), Y(upTo[i].parameters.b));
      ctx.lineTo(X(upTo[i + 1].parameters.a), Y(upTo[i + 1].parameters.b));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Marker
    const cur = history[hi].parameters;
    const mx = Math.max(MARGIN, Math.min(MARGIN + plotW, X(cur.a)));
    const my = Math.max(MARGIN, Math.min(MARGIN + plotW, Y(cur.b)));
    ctx.beginPath();
    ctx.arc(mx, my, 19, 0, Math.PI * 2);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(mx, my, 11, 0, Math.PI * 2);
    ctx.fillStyle = '#f59e0b';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3.5;
    ctx.stroke();
    ctx.restore();

    // Plot frame
    ctx.strokeStyle = frameColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(MARGIN, MARGIN, plotW, plotW);

    // Labels: α / β, problem name, live step counter, watermark
    ctx.fillStyle = frameColor;
    ctx.font = 'italic 28px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('α', SIZE / 2, SIZE - 22);
    ctx.fillText('β', 26, SIZE / 2);

    ctx.fillStyle = textColor;
    ctx.font = '600 26px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(problemName, MARGIN, MARGIN - 24);
    ctx.font = '600 24px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`step ${history[hi].step}`, SIZE - MARGIN, MARGIN - 24);

    ctx.globalAlpha = 0.55;
    ctx.font = '600 20px Georgia, serif';
    ctx.fillText('∂ Gradient Descent Explorer', SIZE - MARGIN, SIZE - 22);
    ctx.globalAlpha = 1;
  }

  const stream = canvas.captureStream(FPS);
  const recorder = new MediaRecorder(stream, {
    mimeType: pickMimeType() || undefined,
    videoBitsPerSecond: 8_000_000
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = e => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const done = new Promise<void>(resolve => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'gradient-descent-run.webm';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      resolve();
    };
  });

  drawFrame(0);
  recorder.start();

  await new Promise<void>(resolve => {
    let f = 0;
    const total = replayFrames + TAIL_HOLD_FRAMES;
    const tick = window.setInterval(() => {
      f++;
      drawFrame(Math.min(f, replayFrames - 1));
      if (f >= total) {
        window.clearInterval(tick);
        recorder.stop();
        resolve();
      }
    }, 1000 / FPS);
  });

  await done;
}
