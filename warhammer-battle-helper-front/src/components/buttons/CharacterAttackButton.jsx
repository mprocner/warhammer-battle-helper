import React from 'react';

// Separate Attack Button component that doesn't inherit draggable behavior
function CharacterAttackButton({ 
    characterId, currentZone, fightZones, onFightComplete, addLogMessage, attackerModifier,
    highlightPossibleTargets, clearHighlightedTargets, setCurrentAttacker, setCurrentDefender
}) {

    // DODAJ TE FUNKCJE
    const handlePossibleTargets = () => {
        setCurrentAttacker(currentZone.character);
        if (highlightPossibleTargets) {
            highlightPossibleTargets(currentZone, fightZones);
        }
        console.log("Attacker set to:", currentZone.character);
    };

    return (
        <button
            onClick={handlePossibleTargets}
            className="icon-btn attack-btn"
            title="Attack"
            aria-label="Attack"
        >
            <img 
                src="/img/attack.png" 
                alt="Attack"
                draggable="false"
            />
        </button>
    );
}

export default CharacterAttackButton;