import { createContext } from 'react';

// The dice controller lives in GameSession (it reacts to WS roll events) while its canvas
// lives deep inside the scene; the context joins the two without threading props through
// DndContext. null = no game session around the scene: the overlay renders nothing.
const DiceAnimationContext = createContext(null);

export default DiceAnimationContext;
