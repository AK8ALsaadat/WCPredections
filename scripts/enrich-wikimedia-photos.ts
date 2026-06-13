import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

import { fetchWikidataPlayerPhotos } from "@/services/wikidata-player-photos.service";
import { prisma } from "@/lib/prisma";

function normalizeName(name: string) {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactName(name: string) {
  return normalizeName(name).replace(/\s+/g, "");
}

function editDistance(left: string, right: string): number {
  const row = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let i = 1; i <= left.length; i++) {
    let diag = row[0];
    row[0] = i;
    for (let j = 1; j <= right.length; j++) {
      const prev = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diag + (left[i - 1] === right[j - 1] ? 0 : 1));
      diag = prev;
    }
  }
  return row[right.length];
}

function similarity(a: string, b: string) {
  const A = compactName(a);
  const B = compactName(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  return 1 - editDistance(A, B) / Math.max(A.length, B.length);
}

async function main() {
  console.log("Starting Wikimedia enrichment...");
  const players = await prisma.player.findMany({ select: { id: true, name: true, photoUrl: true } });
  console.log(`Players total considered: ${players.length}`);

  let totalUpdated = 0;

  const batchSize = 40;
  for (let i = 0; i < players.length; i += batchSize) {
    const batch = players.slice(i, i + batchSize);
    const names = batch.map((p) => p.name);
    console.log(`Processing batch ${i / batchSize + 1}: ${names.length} names`);
    try {
      const photos = await fetchWikidataPlayerPhotos(names);
      if (photos.size === 0) {
        console.log("  no wikidata photos returned for this batch");
        continue;
      }

      for (const [label, url] of photos.entries()) {
        // find best match in batch
        let best: { playerId: string; name: string; score: number; photoUrl?: string } | null = null;
        for (const p of batch) {
          const score = similarity(p.name, label);
          if (!best || score > best.score) best = { playerId: p.id, name: p.name, score, photoUrl: p.photoUrl };
        }
        if (best && best.score >= 0.75) {
          const current = best.photoUrl ?? null;
          const isBetter = () => {
            if (!current) return true;
            const lower = String(current).toLowerCase();
            // prefer Wikimedia cropped/thumb URLs or filenames
            if (/special:filepath/.test(lower)) return true;
            if (/500px-|thumb|cropped|portrait|headshot|avatar/.test(url)) return true;
            return false;
          };

          if (isBetter()) {
            try {
              await prisma.player.update({ where: { id: best.playerId }, data: { photoUrl: url } });
              totalUpdated++;
              console.log(`  updated ${best.name} <- ${label} (score=${best.score.toFixed(2)})`);
            } catch (e) {
              console.warn(`  failed to update ${best.name}: ${String(e)}`);
            }
          } else {
            // existing photo seems fine; skip
          }
        } else {
          console.log(`  no confident match for '${label}', best=${best?.name ?? 'none'} score=${best?.score?.toFixed(2) ?? 'n/a'}`);
        }
      }
    } catch (e) {
      console.warn(`  batch failed: ${String(e)}`);
    }
  }

  console.log(`Done. Total updated: ${totalUpdated}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
