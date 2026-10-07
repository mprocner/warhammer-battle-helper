import { resolveRollComponent } from './resolveRollComponent';
import ExpressionDiceRoll from './ExpressionDiceRoll';

describe('resolveRollComponent', () => {
    it('serves the expression roll from the shared map without asking the system', () => {
        const system = { getRollComponent: jest.fn() };
        expect(resolveRollComponent(system, 'expression')).toBe(ExpressionDiceRoll);
        expect(system.getRollComponent).not.toHaveBeenCalled();
    });

    it('falls back to the system registry for system-specific rolls', () => {
        const SkillRoll = () => null;
        const system = { getRollComponent: jest.fn(() => SkillRoll) };
        expect(resolveRollComponent(system, 'skill')).toBe(SkillRoll);
        expect(system.getRollComponent).toHaveBeenCalledWith('skill');
    });
});
