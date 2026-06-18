# Weapons table feature

This feature introduces weapons table to custom template builder.

## Fields

GM would compose weapons table and it will be displayed as a table. Creator needs to provide possibility to add different fields types to table:

- text
- number
- select

To select field we can either provide list of options or set options as a skills list

Besides that we show Add to favourites star at the beginning of row, damage formula as separate column and roll button

## Rolls

Roll mechanics will use roll formula like in skills.

## Damage

Damage calculation will use the same formula like Rolls, but we need to add 1 more field. It will be number input. For
example if weapons deals damages: [1]D[10] + STR - in brackets there are input fields. It should appear in character
sheet in that way to let player to fill it easily

## Options

- GM would select roll formula from formula builder like it is for skills.

## Output
Roll output will be presented in chat like skill rolls. If success it will show additional damage info. Like it is for example in Call of Cthulhu.

