import React, { useContext, useEffect, useRef } from 'react';
import DiceAnimationContext from './DiceAnimationContext';
import './DiceOverlay.css';

// The library finds its container by CSS selector, so the overlay needs a selector-safe id
// (React's useId yields ":r1:", which is not one).
let nextId = 0;

/**
 * Transparent layer over the scene that the 3D dice are drawn into. It never takes a pointer
 * event: the scene's own mouse handling stays exactly as if the dice were not there.
 */
const DiceOverlay = () => {
  const controller = useContext(DiceAnimationContext);
  const ref = useRef(null);
  const idRef = useRef(null);
  if (idRef.current === null) idRef.current = `dice-overlay-${++nextId}`;

  useEffect(() => {
    const el = ref.current;
    if (!controller || !el) return undefined;
    controller.attach(el);
    return () => controller.detach(el);
  }, [controller]);

  if (!controller) return null;
  return <div id={idRef.current} ref={ref} className="dice-overlay" aria-hidden="true" />;
};

export default DiceOverlay;
