# Dice and chat

## Chat

Type a message and press Enter. The limit is 500 characters. All messages and rolls land in the
shared chronicle, newest at the bottom.

## Commands

| Command | What it does |
|---|---|
| `/roll <expression>` or `/r` | Roll dice. Who sees it follows the visibility list |
| `/gmroll <expression>` or `/gmr` | Secret roll, only the GM sees the result |
| `/help` | List of commands and examples |

## Expressions

| Example | Meaning |
|---|---|
| `/r d10` | one d10 |
| `/r 3d100` | three d100, summed |
| `/r d100 -1` | d100 minus 1 |
| `/r 2d6 + 1d4 + 3` | different dice plus a bonus |
| `/r 4d6kh3` | keep the 3 highest |
| `/r 2d20kl1` | keep the lowest |
| `/r 6d10>=7` | count dice showing 7 or more |
| `/r d100-10 vs 45` | success when the result is 45 or less |
| `/gmr d20` | only the GM sees it |

Limits: up to 20 dice in one part and 50 in the whole roll, dice up to 1000 sides, expressions
up to 100 characters. Counting successes (`>=`) must be the only dice in the roll and cannot be
combined with `vs`.

## Who sees a roll

| Option | Seen by |
|---|---|
| Everyone | the whole table |
| GM + Player | the game master and you |
| GM Only | only the game master (you get a confirmation that it was sent) |
| a chosen player | you and that player |

## Statistics

Your rolls in a game are in the **General** tab, and across all games in **Settings**: number of
rolls, average, critical successes, fumbles and the distribution of results.
