import gameScreen from './gameScreen';
import chat from './chat';
import notes from './notes';
import files from './files';
import scenes from './scenes';
import handouts from './handouts';
import music from './music';
import players from './players';
import minigames from './minigames';

// Jedno miejsce, w którym silnik dowiaduje się o istnieniu samouczka.
// Dodanie kolejnego to jeden import i jeden wpis — zero zmian w engine/.
const TOURS = {
  gameScreen,
  chat,
  notes,
  files,
  scenes,
  handouts,
  music,
  players,
  minigames,
};

export const TOUR_IDS = Object.keys(TOURS);

export const getTour = (id) => TOURS[id] || null;
