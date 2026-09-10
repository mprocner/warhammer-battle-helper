// UWAGA na unikalność: `.music-tab__section` występuje TRZY razy (MusicTab.jsx),
// więc jako kotwica trafiłby w sekcję głośności, nie w bibliotekę. `.music-tab__add-btn` też
// nie jest unikalny (dwa wystąpienia w samej bibliotece). Bierzemy nagłówek sekcji:
// `.music-tab__section-header--clickable` ma dwa wystąpienia (biblioteka, playlisty),
// a querySelector zwraca pierwsze w kolejności dokumentu — czyli zawsze bibliotekę. Renderuje
// się bezwarunkowo, więc krok nie wypada w pustej bibliotece.
// .music-tab__now-playing renderuje się dopiero, gdy coś już grało (MusicTab.jsx),
// więc w świeżej grze ten krok wypada — nie ma czego objaśniać.
// .music-tab__create-btn występuje raz, w nagłówku playlist (MusicTab.jsx).
// .music-tab__volume-control występuje raz, przy głośności MG (MusicTab.jsx).
const music = {
  id: 'music',
  steps: [
    { id: 'library', target: '.music-tab__section-header--clickable', placement: 'left' },
    { id: 'nowPlaying', target: '.music-tab__now-playing', placement: 'left' },
    { id: 'playlists', target: '.music-tab__create-btn', placement: 'left' },
    { id: 'volume', target: '.music-tab__volume-control', placement: 'left' },
  ],
};

export default music;
