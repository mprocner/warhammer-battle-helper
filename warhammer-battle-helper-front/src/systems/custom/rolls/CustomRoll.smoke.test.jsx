import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import '../../../i18n';
import CustomRoll from './CustomRoll';

describe('CustomRoll', () => {
  it('renders dice tokens and the formula line under them for a pool roll with dice', () => {
    const data = {
      outcome: 'regular_success',
      roll: 2,
      target: 4,
      poolSuccesses: 2,
      poolSuccessCondition: 'gte',
      poolFormula: [
        { kind: 'dice', sides: 6, rolls: [4] },
        { kind: 'text', text: '+' },
        { kind: 'dice', sides: 10, rolls: [7] },
        { kind: 'text', text: '+' },
        { kind: 'dice', sides: 10, rolls: [2] },
      ],
    };
    const { container } = render(<CustomRoll data={data} timestamp={null} />);

    const dice = container.querySelectorAll('.custom-pool-die');
    expect(dice).toHaveLength(3);

    const formulaLine = container.querySelector('.log-formula-breakdown');
    expect(formulaLine).not.toBeNull();
    expect(formulaLine.textContent).toBe('D6+D10+D10');

    // formula line must come after the dice row in DOM order
    const content = container.querySelector('.log-list-item__content');
    const children = Array.from(content.children);
    expect(children.indexOf(container.querySelector('.custom-pool-dice')))
      .toBeLessThan(children.indexOf(formulaLine));
  });

  it('renders the formula line for a pool roll whose formula has only text parts (no dice)', () => {
    // e.g. attribute STR + op "+" + const 2 — a formula the builder permits with no die block.
    // diceType is also set here to pin that hasFormula still suppresses the die label in the
    // description line whenever a formula is shown.
    const data = {
      outcome: 'regular_success',
      roll: 2,
      target: 0,
      diceType: 6,
      poolFormula: [
        { kind: 'text', text: 'STR' },
        { kind: 'text', text: '+' },
        { kind: 'text', text: '2' },
      ],
    };
    const { container } = render(<CustomRoll data={data} timestamp={null} />);

    expect(container.querySelectorAll('.custom-pool-die')).toHaveLength(0);

    const formulaLine = container.querySelector('.log-formula-breakdown');
    expect(formulaLine).not.toBeNull();
    expect(formulaLine.textContent).toBe('STR+2');
  });

  // FEATURE-164: only target "roll" bakes the modifier into the formula breakdown text.
  // A pool roll's modifier normally targets "dice_count" (see modifierConfig.js's
  // DEFAULT_MODIFIER_CONFIG.poolTarget), which formulaBreakdown/poolFormula says nothing
  // about — so unlike the case above (no modifier at all), a pool roll that DOES carry a
  // modifier must still show it next to the roll, even though a formula line is present.
  it('shows a pool modifier separately when its target is not "roll"', () => {
    const data = {
      outcome: 'regular_success',
      roll: 2,
      target: 0,
      modifier: 2,
      modifierTarget: 'dice_count',
      poolFormula: [
        { kind: 'text', text: 'STR' },
        { kind: 'text', text: '+' },
        { kind: 'text', text: '2' },
      ],
    };
    const { container } = render(<CustomRoll data={data} timestamp={null} />);

    const modifierNode = container.querySelector('.log-modifier');
    expect(modifierNode).not.toBeNull();
    expect(modifierNode.textContent).toBe(' (+2)');
  });

  it('shows the target even when it is negative (a real, cancelled-out skill total)', () => {
    // FEATURE-162: a skill roll target of -10 (base 30, advances -40) used to be hidden
    // by a `data.target > 0` guard, leaving the player with a roll and no target to check
    // it against.
    const data = {
      outcome: 'failure',
      roll: 3,
      target: -10,
    };
    const { container } = render(<CustomRoll data={data} timestamp={null} />);

    const description = container.querySelector('.log-list-item__description');
    expect(description.textContent).toContain('vs -10');
  });

  it('shows the target when a non-pool roll genuinely computes to zero', () => {
    // FEATURE-162 finding 1: a fully cancelled skill (base 30, advances -30) now sends a
    // real Target of 0. It must still render, unlike the pool case below.
    const data = {
      outcome: 'regular_success',
      roll: 6,
      target: 0,
    };
    const { container } = render(<CustomRoll data={data} timestamp={null} />);

    const description = container.querySelector('.log-list-item__description');
    expect(description.textContent).toContain('vs 0');
  });

  it('hides "vs 0" on a pool roll with no configured success threshold', () => {
    // FEATURE-162 finding 7: PoolSuccessThreshold defaults to 0 ("any die counts", see
    // roller.go) when the GM leaves it unset. Fix wave 1's not-null target guard started
    // showing "vs 0" here too, but no die can ever roll 0, so an unset threshold and an
    // explicit "gte 0" behave identically — the number carries no information.
    const data = {
      outcome: 'regular_success',
      roll: 2,
      target: 0,
      poolSuccesses: 2,
      poolSuccessCondition: 'gte',
      poolFormula: [
        { kind: 'dice', sides: 6, rolls: [4] },
        { kind: 'text', text: '+' },
        { kind: 'dice', sides: 6, rolls: [2] },
      ],
    };
    const { container } = render(<CustomRoll data={data} timestamp={null} />);

    const description = container.querySelector('.log-list-item__description');
    expect(description.textContent).not.toContain('vs 0');
  });

  // BUG-192: nazwa atrybutu z customowej karty jest wpisywana przez gracza, więc bywa długa.
  // jsdom nie liczy layoutu — podstawiamy szerokości, żeby przetestować warunek obcięcia.
  it('shows the full attribute name in a tooltip when the label is clipped', () => {
    const LONG_SKILL = 'Odporność na działanie magii chaosu';
    const data = { outcome: 'regular_success', roll: 45, target: 55, skillName: LONG_SKILL };
    const { container } = render(<CustomRoll data={data} timestamp={null} />);

    const label = container.querySelector('.log-list-item__description .log-list-item__character-name');
    expect(label).not.toBeNull();
    expect(label.textContent).toBe(LONG_SKILL);

    Object.defineProperty(label, 'scrollWidth', { value: 300, configurable: true });
    Object.defineProperty(label, 'clientWidth', { value: 100, configurable: true });
    fireEvent.mouseEnter(label);

    const tooltip = document.body.querySelector('.portal-tooltip');
    expect(tooltip).not.toBeNull();
    expect(tooltip.textContent).toContain(LONG_SKILL);
  });
});
