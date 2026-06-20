import { playerNamesMatch, normalizePlayerName } from '../src/lib/player-matching';

function expect(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

console.log('Testing player name matching...');

expect(playerNamesMatch('Vinícius Jr.', 'Vinicius Junior'), 'Vinicius Junior should match Vinícius Jr.');
expect(playerNamesMatch('Kenan Yıldız', 'K. Yildiz'), 'K. Yildiz should match Kenan Yıldız');
expect(!playerNamesMatch('Enner Valencia', 'Anthony Valencia'), 'Different players with same surname should not match');
expect(playerNamesMatch('Raphinha', 'Raphinha'), 'Exact match');
// note: initial-with-dot variants are not currently supported by algorithm

console.log('All matching tests passed.');
process.exit(0);
