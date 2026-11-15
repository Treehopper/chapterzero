#!/bin/sh
# Downloads public-domain test EPUBs into fixtures/epub/downloaded (git-ignored).
set -e
dir="$(dirname "$0")/../../fixtures/epub/downloaded"
mkdir -p "$dir"
ua="Mozilla/5.0 (VocabFirst test fixtures)"
for id in 1342 1661 829 2701 84 1232; do
  [ -f "$dir/pg$id.epub" ] || curl -fsSL -A "$ua" -o "$dir/pg$id.epub" "https://www.gutenberg.org/ebooks/$id.epub3.images"
done
se() { [ -f "$dir/se-$2.epub" ] || curl -fsSL -A "$ua" -o "$dir/se-$2.epub" "https://standardebooks.org/ebooks/$1/downloads/$(echo "$1" | tr / _).epub?source=download"; }
se jonathan-swift/gullivers-travels gullivers-travels
se arthur-conan-doyle/the-adventures-of-sherlock-holmes sherlock-holmes-adventures
ls -la "$dir"
