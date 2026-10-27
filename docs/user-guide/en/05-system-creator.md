# System Creator

The creator lets you build your own RPG system: the character sheet, the rolls, and how tokens
look on the map. You pick a finished template when creating a game, the same way as a built-in
system.

Open it from the game list with the **System Creator** tile. Everything saves automatically;
there is no Save button.

## Two tabs

- **General** — settings of the whole system: name, description, language, access, dice,
  modifiers, token display, sheet width.
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
| | Weapons table | Weapons with your columns, an attack roll and a damage formula |
| | Data table | Your own columns for anything that is not rolled, e.g. equipment |
| | Skill tree | Skills in a hierarchy, e.g. a skill and its specialisations |

## Formulas

Computed fields and weapon damage are built from blocks: attributes, numbers, constants,
operators (`+ − × ÷`), brackets and dice. Example: damage `d6 + STR + 2` shows in the log as
`3 + 8 + 2 = 13`. The sheet recalculates values as they change.

## Rolls

In a field's properties you choose whether it can be rolled and how:
- **traditional** — the result is compared with a threshold (e.g. d100 under the skill value),
- **dice pool** — counts the dice that met the success condition.

You can also set levels of success.

**Roll modifier** (General tab): when on, every roll from the sheet first asks the player for a
bonus or penalty. You can add quick buttons, e.g. "−30 Very hard".

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
