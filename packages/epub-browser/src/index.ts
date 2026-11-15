/**
 * EpubReader (README §7.1 step 1): unzip, container.xml → OPF → spine → XHTML blocks + TOC.
 * Uses htmlparser2 instead of DOMParser so it runs in a Web Worker (and in Node for tests).
 */
import JSZip from 'jszip';
import { parseDocument } from 'htmlparser2';
import type { ChildNode, Element } from 'domhandler';
import type { EpubContent, EpubReader } from '@vocabfirst/core';

type Block = EpubContent['sections'][number]['blocks'][number];

const BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'dd', 'dt', 'td', 'th', 'pre', 'figcaption', 'caption',
  'blockquote', 'div', 'section', 'article', 'aside', 'header', 'footer', 'main', 'nav', 'table', 'tr', 'ul', 'ol', 'dl', 'figure', 'hr', 'body', 'hgroup', 'address']);
const SKIP_TAGS = new Set(['script', 'style', 'head', 'rt', 'rp', 'svg', 'math', 'title', 'template']);

const isEl = (n: ChildNode): n is Element => n.type === 'tag' || n.type === 'script' || n.type === 'style';
const local = (name: string) => name.toLowerCase().replace(/^.*:/, '');
const children = (n: Element) => n.children;

function find(n: ChildNode | Element, pred: (e: Element) => boolean): Element | undefined {
  if (isEl(n) && pred(n)) return n;
  if ('children' in n) for (const c of (n as Element).children) { const r = find(c, pred); if (r) return r; }
  return undefined;
}
function findAll(n: ChildNode | Element, pred: (e: Element) => boolean, out: Element[] = []): Element[] {
  if (isEl(n) && pred(n)) out.push(n);
  if ('children' in n) for (const c of (n as Element).children) findAll(c, pred, out);
  return out;
}
function textOf(n: ChildNode): string {
  if (n.type === 'text') return (n as unknown as { data: string }).data;
  if (isEl(n)) return n.children.map(textOf).join('');
  return '';
}

/** Resolve `href` relative to the file `base` (both zip paths). */
function resolvePath(base: string, href: string): { path: string; fragment?: string } {
  const [p, frag] = href.split('#');
  const u = new URL(p || base.split('/').pop() || '', 'https://epub.invalid/' + base);
  return { path: decodeURIComponent(u.pathname.slice(1)), fragment: frag ? decodeURIComponent(frag) : undefined };
}

const isExternal = (href: string) => /^[a-z][a-z0-9+.-]*:/i.test(href);
const clean = (t: string) => t.replace(/[­​]/g, '').replace(/\s+/g, ' ').trim();

export interface ReaderOptions {
  /** turns cover image bytes into a small data URL; omitted → only small covers are kept */
  makeThumbnail?: (bytes: Uint8Array, mime: string) => Promise<string | undefined>;
}

export class ZipEpubReader implements EpubReader {
  constructor(private readonly opts: ReaderOptions = {}) {}

  async read(file: ArrayBuffer): Promise<EpubContent> {
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(file);
    } catch {
      throw new Error('This file is not a valid EPUB (it could not be unzipped).');
    }
    const readText = async (path: string) => {
      const f = zip.file(path) ?? zip.file(Object.keys(zip.files).find((k) => k.toLowerCase() === path.toLowerCase()) ?? '\0');
      return f ? f.async('string') : undefined;
    };
    const container = await readText('META-INF/container.xml');
    if (!container) throw new Error('This file is not a valid EPUB (META-INF/container.xml is missing).');
    const rootfile = find(parseDocument(container, { xmlMode: true }), (e) => local(e.name) === 'rootfile');
    const opfPath = rootfile?.attribs['full-path'];
    const opfText = opfPath && (await readText(opfPath));
    if (!opfPath || !opfText) throw new Error('This EPUB has no package document.');
    const opf = parseDocument(opfText, { xmlMode: true });

    const meta = find(opf, (e) => local(e.name) === 'metadata');
    const title = clean(meta ? textOf(find(meta, (e) => local(e.name) === 'title') ?? ({ type: 'text', data: '' } as never)) : '') || 'Untitled';
    const creator = meta && find(meta, (e) => local(e.name) === 'creator');
    const author = creator ? clean(textOf(creator)) || undefined : undefined;

    const manifest = new Map<string, { href: string; type: string; props: string }>();
    for (const it of findAll(opf, (e) => local(e.name) === 'item')) {
      manifest.set(it.attribs.id, { href: resolvePath(opfPath, it.attribs.href ?? '').path, type: it.attribs['media-type'] ?? '', props: it.attribs.properties ?? '' });
    }
    const spineEl = find(opf, (e) => local(e.name) === 'spine');
    const spine = findAll(spineEl ?? opf, (e) => local(e.name) === 'itemref')
      .map((r) => manifest.get(r.attribs.idref))
      .filter((m): m is NonNullable<typeof m> => !!m && /html|xml/.test(m.type));
    const sectionOf = new Map(spine.map((s, i) => [s.href, i]));

    // ---- sections
    const sections: EpubContent['sections'] = [];
    for (const item of spine) {
      const html = (await readText(item.href)) ?? '';
      sections.push({ blocks: this.blocks(html, item.href, sectionOf) });
    }

    // ---- table of contents: EPUB 3 nav, else EPUB 2 NCX
    let toc: EpubContent['toc'] = [];
    const navItem = [...manifest.values()].find((m) => m.props.split(/\s+/).includes('nav'));
    if (navItem) {
      const navHtml = await readText(navItem.href);
      if (navHtml) toc = this.navToc(navHtml, navItem.href, sectionOf);
    }
    if (toc.length === 0) {
      const ncxId = spineEl?.attribs.toc;
      const ncx = (ncxId && manifest.get(ncxId)) || [...manifest.values()].find((m) => m.type === 'application/x-dtbncx+xml');
      const ncxText = ncx && (await readText(ncx.href));
      if (ncx && ncxText) toc = this.ncxToc(ncxText, ncx.href, sectionOf);
    }

    // ---- cover
    let coverDataUrl: string | undefined;
    const coverMetaId = meta && find(meta, (e) => local(e.name) === 'meta' && e.attribs.name === 'cover')?.attribs.content;
    const cover = [...manifest.values()].find((m) => m.props.split(/\s+/).includes('cover-image')) ?? (coverMetaId ? manifest.get(coverMetaId) : undefined);
    if (cover && /^image\//.test(cover.type)) {
      const bytes = await zip.file(cover.href)?.async('uint8array');
      if (bytes) {
        coverDataUrl = this.opts.makeThumbnail ? await this.opts.makeThumbnail(bytes, cover.type).catch(() => undefined) : undefined;
        if (!coverDataUrl && bytes.length < 200_000) coverDataUrl = `data:${cover.type};base64,${base64(bytes)}`;
      }
    }
    return { meta: { title, author, coverDataUrl }, toc, sections };
  }

  private blocks(html: string, path: string, sectionOf: Map<string, number>): Block[] {
    const doc = parseDocument(html, { lowerCaseTags: true, lowerCaseAttributeNames: true, decodeEntities: true });
    const body = find(doc, (e) => local(e.name) === 'body') ?? doc;
    const out: Block[] = [];
    let text = '';
    let ids: string[] = [];
    let links: Block['links'] = [];
    const flush = () => {
      const t = clean(text);
      if (t) {
        out.push({ text: t, anchorIds: ids, links });
        ids = [];
        links = [];
      }
      text = '';
    };
    const walk = (n: ChildNode) => {
      if (n.type === 'text') { text += (n as unknown as { data: string }).data; return; }
      if (!isEl(n)) return;
      const name = local(n.name);
      if (SKIP_TAGS.has(name)) return;
      if (name === 'br') { text += ' '; return; }
      const block = BLOCK_TAGS.has(name);
      if (block) flush();
      // ids of containers attach to the next block that has text
      if (n.attribs.id) ids.push(n.attribs.id);
      if (n.attribs.name && name === 'a') ids.push(n.attribs.name);
      if (name === 'a' && n.attribs.href) {
        const href = n.attribs.href.trim();
        if (isExternal(href)) return; // B14: text of links that point outside the book
        const target = resolvePath(path, href);
        const section = sectionOf.get(target.path);
        if (section !== undefined) links.push({ section, anchorId: target.fragment });
      }
      for (const c of children(n)) walk(c);
      if (block) flush();
    };
    walk(body as ChildNode);
    flush();
    return out;
  }

  private navToc(html: string, path: string, sectionOf: Map<string, number>): EpubContent['toc'] {
    const doc = parseDocument(html, { lowerCaseTags: true, lowerCaseAttributeNames: true });
    const navs = findAll(doc, (e) => local(e.name) === 'nav');
    const nav = navs.find((n) => /\btoc\b/.test(n.attribs['epub:type'] ?? '') || n.attribs.role === 'doc-toc') ?? navs[0];
    const ol = nav && find(nav, (e) => local(e.name) === 'ol' || local(e.name) === 'ul');
    const toc: EpubContent['toc'] = [];
    const firstHref = (li: Element): string | undefined => find(li, (e) => local(e.name) === 'a' && !!e.attribs.href)?.attribs.href;
    const walkList = (list: Element, depth: number) => {
      for (const li of list.children.filter((c): c is Element => isEl(c) && local(c.name) === 'li')) {
        const label = li.children.find((c): c is Element => isEl(c) && (local(c.name) === 'a' || local(c.name) === 'span'));
        const href = label && local(label.name) === 'a' ? label.attribs.href : firstHref(li);
        if (label && href) {
          const t = resolvePath(path, href);
          const section = sectionOf.get(t.path);
          if (section !== undefined) toc.push({ title: clean(textOf(label)), depth, section, anchorId: t.fragment });
        }
        const sub = li.children.find((c): c is Element => isEl(c) && (local(c.name) === 'ol' || local(c.name) === 'ul'));
        if (sub) walkList(sub, depth + 1);
      }
    };
    if (ol) walkList(ol, 0);
    return toc;
  }

  private ncxToc(xml: string, path: string, sectionOf: Map<string, number>): EpubContent['toc'] {
    const doc = parseDocument(xml, { xmlMode: true });
    const map = find(doc, (e) => local(e.name) === 'navmap');
    const toc: EpubContent['toc'] = [];
    const walk = (el: Element, depth: number) => {
      for (const np of el.children.filter((c): c is Element => isEl(c) && local(c.name) === 'navpoint')) {
        const label = find(np, (e) => local(e.name) === 'text');
        const content = np.children.find((c): c is Element => isEl(c) && local(c.name) === 'content');
        if (content?.attribs.src) {
          const t = resolvePath(path, content.attribs.src);
          const section = sectionOf.get(t.path);
          if (section !== undefined) toc.push({ title: clean(label ? textOf(label) : ''), depth, section, anchorId: t.fragment });
        }
        walk(np, depth + 1);
      }
    };
    if (map) walk(map, 0);
    return toc;
  }
}

function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
