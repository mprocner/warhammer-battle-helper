# System Creator

The creator lets you build your own RPG system: the character sheet, the rolls, and how tokens
look on the map. You pick a finished template when creating a game, the same way as a built-in
system.

Open it with the **System Creator** button in the game list header. You can look at a finished
sheet without opening the creator: the sheet preview is in "My Templates" and in the system list
when creating a game. Everything saves automatically;
there is no Save button.

## Two tabs

- **General** — settings of the whole system: name, description, language, access, dice buttons,
  roll modifier, success levels, token display, sheet width.
- **Sheet** — building the character sheet field by field.

## Building the sheet

1. Start with a **section**. A section is a box with a heading that splits fields into columns.
   Sections can be nested and dragged.
2. Click a field type in the palette on the left. The field goes into the active section (its
   name is shown above the list). Clicking any element on the sheet makes its section active.
3. Hover a field to see its toolbar: drag handle, move up and down, edit (pencil), duplicate,
   delete. The pencil opens the field's properties. The question mark in that window's title
   explains the field you are editing.
4. The eye icon hides the editing tools so you see the sheet exactly as a player will.

The sheet in the creator has the same width and look as in the game.

## Field types

| Group | Field | What for |
|---|---|---|
| Layout | Section | Groups fields under a heading, in columns |
| Character | Character name | Name on the character list and next to the token (one per sheet) |
| | Avatar | Portrait on the list and as the map token (one per sheet) |
| | Image | An image the player uploads, e.g. a coat of arms |
| Stats | Attribute | A number you can roll against, optionally split into base and advances |
| | Attribute table | A whole set of attributes sharing one set of settings |
| | Number | A plain number, e.g. money or experience |
| | Computed | A value from a formula, e.g. a sum of attributes. Players cannot type into it |
| | Progress | A current/maximum pair shown as a bar, e.g. health |
| Text | Short text | One line, e.g. profession |
| | Long text | Several lines, optionally with formatting |
| | Label | Fixed text: a heading, a hint, a rule reminder |
| Choice | Checkbox | Yes/no |
| | Dropdown | A choice from your list, e.g. race |
| Tables | Skill table | Skills with values to roll against. Players can add their own if you allow it |
| | Weapons table | Weapons with your columns, an attack roll and a damage formula. You can add preset weapons |
| | Data table | Your own columns for anything that is not rolled, e.g. equipment. You can add preset rows |
| | Skill tree | Skills in a hierarchy, e.g. a skill and its specialisations |

## Formulas

Computed fields and weapon damage are built from blocks: attributes, numbers, constants,
operators (`+ − × ÷`), brackets and dice. Example: damage `d6 + STR + 2` shows in the log as
`3 + 8 + 2 = 13`. The sheet recalculates values as they change.

In a damage formula, generic dice and the player field (▢) become inputs the player fills in for
each weapon. The player field takes a number or dice, e.g. `2`, `-1`, `1d4`, `1d6+1`.

**Preset weapons and rows** are entries players add from a list. Those marked **Add when a
character is created** are already on every new character's sheet as the player's own editable rows.

## Rolls

In a field's properties (the **Roll** group), tick **Rollable** and pick the **Roll mechanics**:

- **Traditional** — a roll formula (e.g. `d100` or `2d6+STR`) and a **Success condition**:
  - **Result ≤ attribute** — roll under the target, lower is better,
  - **Result ≥ attribute** — roll over the target, higher is better,
  - **Raw result** — just the number, no success or failure.

  The target is the field's value. You can change it with a formula in **Threshold (formula)**,
  e.g. `skill*5` or `attr+10`.
- **Dice Pool** — roll several dice and count the ones that meet the **Success condition**
  (**≥** or **=**) against the **Success threshold**. The log shows the number of successes.

A weapon roll works the same way: the target is the value of the skill picked in the skill column.

## Roll modifier

The **Roll modifier** card in the General tab. With **Ask for a modifier before rolling** on,
every roll from the sheet first opens a small prompt. When it is off, clicking rolls straight away.

The **Modifier type** is one of two: **Number** or **Edge and setback dice**. A template always has
just one type. Switching does not erase the other type's settings, so you can come back to them.

### Number

The player types a number (Enter confirms, Escape cancels) or clicks a quick pick.

| Setting | Options |
|---|---|
| **Traditional rolls — where the modifier goes** | **To the roll result**: +20 turns a roll of 48 into 68, the threshold stays. **To the success threshold**: +20 turns a threshold of 55 into 75, the roll stays |
| **Dice pools — where the modifier goes** | **To the number of dice**: +2 rolls 2 more dice, −2 rolls 2 fewer (never fewer than one). **To the success threshold**: +2 turns a threshold of 7 into 9 |
| **Step**, **Min**, **Max** | The prompt's step and range. Min and max both at 0 mean no limits |
| **Quick picks** | Buttons with a value and a label, e.g. `−30` "Very hard", `+20` "Easy" |

**Tip:** on a roll-under field (**Result ≤ attribute**) a positive modifier added **to the result**
makes the roll harder, while one added **to the threshold** makes it easier. If "+20" should mean an
easier test in your system, choose **To the success threshold**.

### Edge and setback dice

Instead of a number, the player picks how many extra dice to roll from a column of buttons. The `0`
button appears under the cursor, with edge above it and setback below.

- **Edge** rolls extra dice and keeps the **best** result, **setback** keeps the **worst**. Which is
  better follows the field's success condition: lower for **Result ≤ attribute**, higher for
  **Result ≥ attribute**.
- **How extra dice roll**:
  - **Whole formula** — each extra die rolls the field's whole formula once more,
  - **Tens die (d100 only)** — each extra die rolls only a new tens digit and the units stay.
    Works when the field's formula is a single `d100`.
- **Max edge dice** and **Max setback dice** — from 0 to 5. Zero turns that side off, e.g. 0 and 2
  give setback only.
- **Raw result** fields and dice pools roll without extra dice.

The log shows something like "+2 edge dice" next to the result.

## Success levels

The **Success levels** card in the General tab decides how the log grades a roll. It applies to
every traditional roll with a target (**Result ≤ attribute** or **Result ≥ attribute**), weapon
attacks included. It does not apply to **Raw result** or dice pools. The target always counts
**after** the modifier.

| Mode | What the log shows |
|---|---|
| **Off** | Only success or failure |
| **Levels per step** | The result with a number of success levels (SL), e.g. "Success! · +1 SL" |
| **Thresholds** | The name of the threshold reached, in its colour, e.g. "Hard success" |

### Levels per step

Set the **Step** (1 to 100, default 10). With a step of 10, the level is the difference between
the tens digits of the target and of the roll. A failure counts down. Examples for a target of 45
on a roll-under field:

| Roll | Result |
|---|---|
| 38 | Success · +1 SL |
| 44 | Success · +0 SL |
| 47 | Failure · −0 SL |
| 72 | Failure · −3 SL |

On a roll-over field the direction is reversed. The creator shows a live example for your step.

### Thresholds

A threshold is a fraction of the target that a roll must reach for that level. The first time
you open this mode you get a ready set you can change:

| Fraction | Name | Example for a target of 60 |
|---|---|---|
| 1/5 | Extreme success | roll 12 or less |
| 1/2 | Hard success | roll 30 or less |
| 1/1 | Success | roll 60 or less |
| — | Failure | roll above 60 |

- **Add threshold** adds another fraction and **Remove threshold** removes it. Fractions go from
  1/2 to 1/100 and each must be different. A wrong value is outlined in red and is not saved.
- You do not set the order: the hardest threshold (the smallest fraction) is checked first.
- The **Success** and **Failure** rows are always there. You can change their name and colour,
  but you cannot remove them.
- Every row has its own **Colour**, which the log uses for the result.
- Thresholds only apply to **roll-under** fields. A roll-over field shows just success or failure.

### Good to know

- Turning success levels off keeps your thresholds. They come back when you switch to
  **Thresholds** again.
- Entries already in the log do not change when you edit the template: the grade is saved at the
  moment of the roll.
- In an existing game, new settings take effect after **Sync** (see below).
- The card is available only for your own systems. Variants of built-in systems grade rolls their
  own way.

## Token display

In the General tab you decide what a character's token shows on the map: up to 8 ring positions
(states with levels, counters), squares and bars (e.g. health from a Progress field). Every
element can be hidden from players by default.

## Sharing

| Role | Can |
|---|---|
| Viewer | Use the template in games and clone it |
| Editor | The same, plus edit it |
| Owner | The same, plus manage access and delete the template |

A **public** template can be used by any logged-in user, but only members can edit it. The
description and language help others find the template when creating a game.

If someone else saved changes while you were editing, or you lost access, the creator stops
saving and asks what to do.

## After changing a template

Games use a copy of the template. To give a game the new version, the game master clicks
**Sync** on the game's card in the game list. Values of fields removed from the template will be
lost. Renaming a field is safe: every field has a fixed identifier independent of its name.
