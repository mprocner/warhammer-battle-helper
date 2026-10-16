import gameScreen from './gameScreen';
import chat from './chat';
import notes from './notes';
import files from './files';
import scenes from './scenes';
import handouts from './handouts';
import music from './music';
import players from './players';
import minigames from './minigames';
import creatorGeneral from './creatorGeneral';
import creatorSheet from './creatorSheet';
import creatorField from './creatorField';

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
  creatorGeneral,
  creatorSheet,
  creatorField,
};

// Tours of the character-sheet creator; everything else in TOURS belongs to the game screen.
export const CREATOR_TOUR_IDS = ['creatorGeneral', 'creatorSheet', 'creatorField'];

export const TOUR_IDS = Object.keys(TOURS);

export const getTour = (id) => TOURS[id] || null;
