/**
 * Resolve whatever demo link is configured into something embeddable.
 *
 * People paste the URL from their browser bar, not the embed URL, so a plain
 * YouTube/Loom/Vimeo share link has to be translated or the iframe renders a
 * "refused to connect" box.
 */

export type DemoKind = 'iframe' | 'video' | 'none';

export interface DemoSource {
  kind: DemoKind;
  /** Embeddable URL for an iframe, or a direct media URL for <video>. */
  src?: string;
  /** Where the original lives, for the "open in new tab" link. */
  href?: string;
}

const YOUTUBE_ID = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/;
const LOOM_ID = /loom\.com\/(?:share|embed)\/([\w-]+)/;
const VIMEO_ID = /vimeo\.com\/(?:video\/)?(\d+)/;
const DIRECT_MEDIA = /\.(mp4|webm|ogg|mov)(\?.*)?$/i;

export function resolveDemoSource(raw: string | undefined | null): DemoSource {
  const url = raw?.trim();
  if (!url) return { kind: 'none' };

  const youtube = YOUTUBE_ID.exec(url);
  if (youtube) {
    return {
      kind: 'iframe',
      // rel=0 keeps YouTube from suggesting unrelated videos afterwards.
      src: `https://www.youtube-nocookie.com/embed/${youtube[1]}?rel=0`,
      href: url,
    };
  }

  const loom = LOOM_ID.exec(url);
  if (loom) {
    return { kind: 'iframe', src: `https://www.loom.com/embed/${loom[1]}`, href: url };
  }

  const vimeo = VIMEO_ID.exec(url);
  if (vimeo) {
    return { kind: 'iframe', src: `https://player.vimeo.com/video/${vimeo[1]}`, href: url };
  }

  // A file we serve ourselves, or any direct media link.
  if (DIRECT_MEDIA.test(url) || url.startsWith('/')) {
    return { kind: 'video', src: url, href: url };
  }

  // Unrecognised host: try it in an iframe rather than refusing outright, since
  // plenty of players embed fine.
  return { kind: 'iframe', src: url, href: url };
}

/** Steps shown alongside the video, and on their own when none is set. */
export const DEMO_STEPS: Array<{ title: string; body: string }> = [
  {
    title: 'Set up the campaign',
    body:
      'Name the role, list the skills it needs, and choose up to five screening questions. ' +
      'The agent script is generated from this and shown beside it.',
  },
  {
    title: 'Add candidates',
    body:
      'Drop in a spreadsheet or type numbers by hand. Columns are detected automatically and ' +
      'numbers are normalised, so a bare 10-digit mobile still dials.',
  },
  {
    title: 'The agent calls',
    body:
      'It greets each candidate by name, asks whether they prefer English or Hindi, works ' +
      'through the questions, and declines to answer anything off-script.',
  },
  {
    title: 'Read the shortlist',
    body:
      'Answers are scored out of 100 and ranked best-match first, with a per-question ' +
      'breakdown. Change the criteria and everyone re-ranks instantly — nobody is called twice.',
  },
];
