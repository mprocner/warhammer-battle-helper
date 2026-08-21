import { findDeletablePathAt } from './DrawingLayer';

// Pozioma linia od (0,y) do (100,y) — hitTestPath ma tolerancję 10, więc
// punkt (50, y) trafia, a (50, y + 500) na pewno nie.
const line = (id, userId, y) => ({
  id,
  userId,
  tool: 'line',
  points: [[0, y], [100, y]],
  brushSize: 3,
});

const mine = path => path.userId === 'me';
const asGM = () => true;

describe('findDeletablePathAt', () => {
  it('zwraca id własnej ścieżki pod kursorem', () => {
    const paths = [line('a', 'me', 50)];
    expect(findDeletablePathAt(paths, 50, 50, mine)).toBe('a');
  });

  it('nie zwraca cudzej ścieżki, gdy nie jesteś GM', () => {
    const paths = [line('a', 'someone-else', 50)];
    expect(findDeletablePathAt(paths, 50, 50, mine)).toBeNull();
  });

  it('przeskakuje cudzą ścieżkę na wierzchu i sięga po własną pod spodem', () => {
    const paths = [line('own', 'me', 50), line('theirs', 'someone-else', 50)];
    expect(findDeletablePathAt(paths, 50, 50, mine)).toBe('own');
  });

  it('pozwala GM-owi skasować cudzą ścieżkę', () => {
    const paths = [line('theirs', 'someone-else', 50)];
    expect(findDeletablePathAt(paths, 50, 50, asGM)).toBe('theirs');
  });

  it('zwraca null, gdy pod kursorem nic nie ma', () => {
    const paths = [line('a', 'me', 50)];
    expect(findDeletablePathAt(paths, 50, 550, mine)).toBeNull();
  });

  it('przy dwóch własnych nachodzących zwraca tę dodaną później', () => {
    const paths = [line('older', 'me', 50), line('newer', 'me', 50)];
    expect(findDeletablePathAt(paths, 50, 50, mine)).toBe('newer');
  });
});
