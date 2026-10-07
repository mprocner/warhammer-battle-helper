// The roll is asserted through its BEM class names; the testing-library queries have no role/text hook for the dice.
/* eslint-disable testing-library/no-node-access, testing-library/render-result-naming-convention */
import React from 'react';
import { render } from '@testing-library/react';
import '../../i18n';
import ExpressionDiceRoll from './ExpressionDiceRoll';

const base = { rollType: 'expression', username: 'Ania', visibility: 'all' };
const die = (value, extra = {}) => ({ value, kept: true, success: false, ...extra });

const renderRoll = (data) => render(<ExpressionDiceRoll data={{ ...base, ...data }} timestamp="12:00" />).container;

describe('ExpressionDiceRoll', () => {
    it('puts every term on its own row with a label, its dice and a subtotal', () => {
        const c = renderRoll({
            expression: '2d6+1d4-1',
            mode: 'sum',
            total: 8,
            terms: [
                { sign: 1, count: 2, sides: 6, dice: [die(4), die(2)], subtotal: 6 },
                { sign: 1, count: 1, sides: 4, dice: [die(3)], subtotal: 3 },
                { sign: -1, constant: 1, subtotal: 1 },
            ],
        });

        expect(c.querySelector('.log-list-item__description').textContent).toBe('2d6+1d4-1');

        const rows = [...c.querySelectorAll('.expression-roll__term')];
        expect(rows.map(r => r.querySelector('.expression-roll__label').textContent)).toEqual(['2d6', '+1d4', '−1']);
        expect([...rows[0].querySelectorAll('.expression-roll__die')].map(n => n.textContent)).toEqual(['4', '2']);
        expect([...rows[1].querySelectorAll('.expression-roll__die')].map(n => n.textContent)).toEqual(['3']);
        expect(rows.map(r => r.querySelector('.expression-roll__subtotal')?.textContent ?? null)).toEqual(['= 6', '= 3', null]);
        // The subtotal sits under the label, not in a column of its own.
        expect(rows[0].querySelector('.expression-roll__head .expression-roll__subtotal')).not.toBeNull();
        expect(rows[2].querySelector('.expression-roll__die')).toBeNull();

        expect(c.querySelector('.expression-roll__total').textContent).toBe('8');
        expect(c.querySelector('.expression-roll__check')).toBeNull();
    });

    it('labels a single-term roll the same way', () => {
        const c = renderRoll({ expression: '1d100', mode: 'sum', total: 55,
            terms: [{ sign: 1, count: 1, sides: 100, dice: [die(55)], subtotal: 55 }] });

        expect(c.querySelectorAll('.expression-roll__term')).toHaveLength(1);
        expect(c.querySelector('.expression-roll__label').textContent).toBe('1d100');
        expect(c.querySelector('.expression-roll__subtotal').textContent).toBe('= 55');
    });

    it('puts keep and threshold modifiers into the row label', () => {
        const keep = renderRoll({ expression: '4d6kh3+2d20kl1', mode: 'sum', total: 20, terms: [
            { sign: 1, count: 4, sides: 6, keep: { highest: true, count: 3 }, dice: [die(6), die(5), die(4), die(1, { kept: false })], subtotal: 15 },
            { sign: 1, count: 2, sides: 20, keep: { highest: false, count: 1 }, dice: [die(5), die(9, { kept: false })], subtotal: 5 },
        ] });
        expect([...keep.querySelectorAll('.expression-roll__label')].map(n => n.textContent)).toEqual(['4d6kh3', '+2d20kl1']);

        const pool = renderRoll({ expression: '3d10>=7', mode: 'pool', total: 1, terms: [
            { sign: 1, count: 3, sides: 10, threshold: 7, dice: [die(7, { success: true }), die(3), die(2)], subtotal: 1 },
        ] });
        expect(pool.querySelector('.expression-roll__label').textContent).toBe('3d10>=7');
    });

    it('marks dice dropped by keep', () => {
        const c = renderRoll({
            expression: '4d6kh3',
            mode: 'sum',
            total: 14,
            terms: [{ sign: 1, count: 4, sides: 6, keep: { highest: true, count: 3 },
                dice: [die(3), die(6), die(1, { kept: false }), die(5)], subtotal: 14 }],
        });

        const dropped = c.querySelectorAll('.expression-roll__die--dropped');
        expect(dropped).toHaveLength(1);
        expect(dropped[0].textContent).toBe('1');
    });

    it('highlights pool successes and labels the total differently', () => {
        const sum = renderRoll({ expression: '1d6', mode: 'sum', total: 3,
            terms: [{ sign: 1, count: 1, sides: 6, dice: [die(3)], subtotal: 3 }] });
        const sumLabel = sum.querySelector('.expression-roll__total-label').textContent;

        const pool = renderRoll({ expression: '3d10>=7', mode: 'pool', total: 2,
            terms: [{ sign: 1, count: 3, sides: 10, threshold: 7,
                dice: [die(7, { success: true }), die(3), die(9, { success: true })], subtotal: 2 }] });

        expect(pool.querySelectorAll('.expression-roll__die--success')).toHaveLength(2);
        expect(pool.querySelector('.expression-roll__total-label').textContent).not.toBe(sumLabel);
    });

    it('shows the outcome of a vs check', () => {
        const terms = [{ sign: 1, count: 1, sides: 100, dice: [die(55)], subtotal: 55 }, { sign: -1, constant: 10, subtotal: 10 }];

        const pass = renderRoll({ expression: '1d100-10 vs 45', mode: 'sum', total: 45, terms, check: { target: 45, success: true } });
        expect(pass.querySelector('.expression-roll__check--success').textContent).toContain('45');

        const fail = renderRoll({ expression: '1d100-10 vs 44', mode: 'sum', total: 45, terms, check: { target: 44, success: false } });
        expect(fail.querySelector('.expression-roll__check--failure').textContent).toContain('44');
    });
});
