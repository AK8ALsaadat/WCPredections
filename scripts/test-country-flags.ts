import { getFlagUrl, getFlagEmoji } from '../src/lib/country-flags';

const samples = [
  'السعودية',
  'saudi arabia',
  'الكويت',
  'kuwait',
  'england',
  'England',
  'Unknownland',
  'يح',
  'tbd-123-home',
];

for (const s of samples) {
  const url = getFlagUrl(s);
  const emoji = getFlagEmoji(s);
  console.log(`${s} -> url=${url ?? 'null'} emoji=${emoji}`);
}
