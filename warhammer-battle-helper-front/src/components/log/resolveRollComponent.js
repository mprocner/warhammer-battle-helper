import ExpressionDiceRoll from './ExpressionDiceRoll';

// Roll types every game system renders the same way. Checked before the system's own
// registry, so a system-agnostic roll needs no entry in each systems/*/index.js.
const SHARED_ROLL_COMPONENTS = {
    expression: ExpressionDiceRoll,
};

export function resolveRollComponent(system, rollType) {
    return SHARED_ROLL_COMPONENTS[rollType] || system.getRollComponent(rollType);
}
