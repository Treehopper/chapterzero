/**
 * Generates fixtures/epub/omnibus-fixture.epub: a small EPUB 3 omnibus with two works,
 * repeated chapter names, front/back matter, footnotes (B13) and a watermark link (B14).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const out = fileURLToPath(new URL('../../fixtures/epub/omnibus-fixture.epub', import.meta.url));

const P1 = `The gaunt man strode across the moor at dusk, his lantern swinging in the gale. Heather brushed his boots and the
  ravine below was full of a sullen fog. He would not relinquish the parchment that he carried, though the wretch who followed
  him had a dagger and a quiver of arrows. In the hollow by the old cottage an ember still glowed in the hearth, and he paused
  to ponder the solemn vow he had made to his brother many years before.`;
const P2 = `When the tempest came the bough of the great oak bent low over the rampart. The haggard keeper of the tavern stood in
  the doorway and watched the lightning glimmer on the cobblestone road. Somewhere in the thicket a lantern was moving, and he
  felt a forlorn and weary dread that he could not explain. The meadow lay ashen under the moon, the mire was deep, and the
  quill on his desk had been left beside an unfinished letter.`;
const P3 = `In the harbour the ships were quiet. A sailor sat on a coil of rope and whispered to the gulls about the ephemeral
  glory of youth. He had seen the scythe of the reaper pass over many friends, and he would loom over the younger men with a
  brooding look, telling them to kindle their courage before the next voyage. The shelves of his cabin were full of books,
  and mice ran between them at night while the geese cried overhead.`;
const P4 = `The old encyclopaedia in the captain's cabin had a page about oxen and another about the melancholy art of
  navigation. The captain would saunter along the deck each evening, his wistful gaze on the horizon, and the crew would dwindle
  into silence as he passed. He told them to lurk in no shadow and to fear no tempest, for the sea was a gallant master to those
  who respected it and an ominous one to those who did not.`;

const para = (t: string) => `<p>${t.replace(/\s+/g, ' ')}</p>`;
const watermark = '<p class="wm"><a href="https://www.free-ebooks.example/">Downloaded from free-ebooks.example</a></p>';
const xhtml = (title: string, body: string) => `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>${title}</title></head>
<body>${body}${watermark}</body></html>`;

const chapter = (heading: string, paras: string[], extra = '') =>
  `<section><h2>${heading}</h2>${paras.map(para).join('')}${extra}</section>`;

const files: [string, string, string][] = [
  ['cover.xhtml', 'Cover', '<div><p>The Lantern Omnibus</p></div>'],
  ['nav.xhtml', 'Contents', ''],
  ['moor.xhtml', 'The Moor', '<h1>The Moor</h1>'],
  ['moor-1.xhtml', 'One', chapter('One', [P1, P2, P1, P2, P1], `<p>He heard of the storm<a href="notes.xhtml#fn1" epub:type="noteref" id="r1">1</a> later.</p>`)],
  ['moor-2.xhtml', 'Two', chapter('Two', [P2, P1, P2, P1, P2])],
  ['harbour.xhtml', 'The Harbour', '<h1>The Harbour</h1>'],
  ['harbour-1.xhtml', 'One', chapter('One', [P3, P4, P3, P4, P3])],
  ['harbour-2.xhtml', 'Two', chapter('Two', [P4, P3, P4, P3, P4], `<p>See the note<a href="notes.xhtml#fn2" id="r2">2</a>.</p>`)],
  ['notes.xhtml', 'Footnotes', `<h2>Footnotes</h2><ol><li id="fn1"><p>The tempest of that year was remembered for a generation. <a href="moor-1.xhtml#r1">↩</a></p></li>
    <li id="fn2"><p>The captain kept a quill and a parchment log of every voyage. <a href="harbour-2.xhtml#r2">↩</a></p></li></ol>`],
  ['about.xhtml', 'About the Author', '<h2>About the Author</h2><p>The author lives in a cottage near the moor and writes about the sea.</p>'],
];

const nav = `<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>
  <li><a href="cover.xhtml">Cover</a></li>
  <li><a href="nav.xhtml">Contents</a></li>
  <li><a href="moor.xhtml">The Moor</a><ol><li><a href="moor-1.xhtml">One</a></li><li><a href="moor-2.xhtml">Two</a></li></ol></li>
  <li><a href="harbour.xhtml">The Harbour</a><ol><li><a href="harbour-1.xhtml">One</a></li><li><a href="harbour-2.xhtml">Two</a></li></ol></li>
  <li><a href="notes.xhtml">Footnotes</a></li>
  <li><a href="about.xhtml">About the Author</a></li>
</ol></nav>`;

const zip = new JSZip();
zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
zip.file('META-INF/container.xml', `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
for (const [name, title, body] of files) zip.file(`OEBPS/${name}`, xhtml(title, name === 'nav.xhtml' ? nav : body));
zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">fixture-omnibus</dc:identifier>
<dc:title>The Lantern Omnibus</dc:title><dc:creator>Fixture Author</dc:creator><dc:language>en</dc:language></metadata>
<manifest>${files.map(([n]) => `<item id="${n.replace('.xhtml', '')}" href="${n}" media-type="application/xhtml+xml"${n === 'nav.xhtml' ? ' properties="nav"' : ''}/>`).join('')}</manifest>
<spine>${files.map(([n]) => `<itemref idref="${n.replace('.xhtml', '')}"/>`).join('')}</spine></package>`);
mkdirSync(fileURLToPath(new URL('../../fixtures/epub/', import.meta.url)), { recursive: true });
writeFileSync(out, await zip.generateAsync({ type: 'uint8array', mimeType: 'application/epub+zip' }));
console.log('wrote', out);
