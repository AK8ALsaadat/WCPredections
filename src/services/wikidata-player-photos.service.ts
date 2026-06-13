import { cachedFetch } from "@/lib/api-cache";

type WikidataBinding = {
  personLabel?: { value?: string };
  image?: { value?: string };
};

type WikidataResponse = {
  results?: {
    bindings?: WikidataBinding[];
  };
};

function escapeSparqlString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export async function fetchWikidataPlayerPhotos(
  playerNames: string[]
): Promise<Map<string, string>> {
  const names = Array.from(
    new Set(playerNames.map((name) => name.trim()).filter(Boolean))
  ).slice(0, 40);
  if (names.length === 0) return new Map();

  const values = names
    .map((name) => `"${escapeSparqlString(name)}"@en`)
    .join(" ");
  const query = `
    SELECT ?personLabel ?image WHERE {
      VALUES ?personLabel { ${values} }
      ?person rdfs:label ?personLabel;
              wdt:P106 wd:Q937857;
              wdt:P18 ?image.
    }
  `;
  const cacheKey = `wikidata-player-photos:${names.slice().sort().join("|")}`;

  try {
    const data = await cachedFetch(
      cacheKey,
      async () => {
        const url = new URL("https://query.wikidata.org/sparql");
        url.searchParams.set("query", query);
        url.searchParams.set("format", "json");
        const response = await fetch(url, {
          headers: {
            Accept: "application/sparql-results+json",
            "User-Agent": "WCPredections/1.0",
          },
          signal: AbortSignal.timeout(15_000),
          next: { revalidate: 0 },
        });
        if (!response.ok) return null;
        return (await response.json()) as WikidataResponse;
      },
      24 * 60 * 60 * 1000
    );

    const photos = new Map<string, string>();
    for (const binding of data?.results?.bindings ?? []) {
      const name = binding.personLabel?.value;
      const image = binding.image?.value;
      if (!name || !image || photos.has(name)) continue;
      // collect the raw image value for later thumbnail resolution
      photos.set(name, image.replace(/^http:/, "https:"));
    }
    // Resolve thumbnails via MediaWiki API for better face thumbnails
    const fileMap = new Map<string, string>(); // name -> fileTitle
    for (const [name, imageUrl] of photos.entries()) {
      let fileTitle: string | null = null;
      try {
        // examples: Special:FilePath/Filename.jpg, /wiki/File:Filename.jpg, direct upload URL
        const m = imageUrl.match(/Special:FilePath\/(.+)$/i);
        if (m) fileTitle = decodeURIComponent(m[1]);
        else if (imageUrl.includes('/wiki/File:')) {
          const parts = imageUrl.split('/');
          fileTitle = parts[parts.length - 1];
        } else {
          // fallback: take last path segment
          try {
            const u = new URL(imageUrl);
            fileTitle = decodeURIComponent(u.pathname.split('/').pop() ?? '');
          } catch {
            fileTitle = null;
          }
        }
        if (fileTitle) {
          // ensure prefix File: if missing
          if (!/^File:/i.test(fileTitle)) fileTitle = `File:${fileTitle}`;
          fileMap.set(name, fileTitle);
        }
      } catch {
        continue;
      }
    }

    if (fileMap.size === 0) return photos;

    // Batch query MediaWiki for thumbnails (max ~50 titles per request)
    const titles = Array.from(new Set(Array.from(fileMap.values()))).slice(0, 50);
    const mwCacheKey = `wikimedia-thumbs:${titles.join('|')}`;
    try {
      const thumbData = await cachedFetch(mwCacheKey, async () => {
        const url = new URL('https://commons.wikimedia.org/w/api.php');
        url.searchParams.set('action', 'query');
        url.searchParams.set('format', 'json');
        url.searchParams.set('prop', 'pageimages');
        url.searchParams.set('piprop', 'thumbnail');
        url.searchParams.set('pithumbsize', String(400));
        url.searchParams.set('titles', titles.join('|'));
        url.searchParams.set('origin', '*');

        const res = await fetch(url.toString(), {
          headers: { 'User-Agent': 'WCPredections/1.0 (contact: dev)' },
          signal: AbortSignal.timeout(15_000),
          next: { revalidate: 0 },
        });
        if (!res.ok) return null;
        return res.json();
      }, 24 * 60 * 60 * 1000);

      const pageMap = new Map<string, { url: string; width?: number; height?: number; title: string }>(); // fileTitle -> thumb info
      const pages = thumbData?.query?.pages ?? {};
      for (const key of Object.keys(pages)) {
        const p = (pages as any)[key];
        if (p && p.title && p.thumbnail && p.thumbnail.source) {
          pageMap.set(p.title, {
            url: p.thumbnail.source.replace(/^http:/, 'https:'),
            width: p.thumbnail.width,
            height: p.thumbnail.height,
            title: p.title,
          });
        }
      }

      const final = new Map<string, string>();
      for (const [name, imageUrl] of photos.entries()) {
        const fileTitle = fileMap.get(name);
        const candidate = fileTitle ? pageMap.get(fileTitle) : undefined;
        let chosen: string | null = null;

        // Prefer portrait thumbnails (height >= width) or filenames containing 'cropped'/'portrait'/'headshot'
        if (candidate) {
          const titleLower = candidate.title.toLowerCase();
          const looksCropped = /cropped|portrait|headshot|face|avatar/.test(titleLower);
          const isPortrait = (candidate.height ?? 0) >= (candidate.width ?? 0);
          if (isPortrait || looksCropped) chosen = candidate.url;
        }

        // fallback: if chosen not set, but candidate exists, use it anyway
        if (!chosen && candidate) chosen = candidate.url;

        // final fallback to original image URL
        final.set(name, chosen ?? imageUrl);
      }

      return final;
    } catch {
      return photos;
    }
  } catch {
    return new Map();
  }
}
