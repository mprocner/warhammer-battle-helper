# Kości i czat

## Czat

Wpisz wiadomość i naciśnij Enter. Limit to 500 znaków. Wszystkie wiadomości i rzuty trafiają
do wspólnej kroniki, najnowsze na dole.

## Komendy

| Komenda | Co robi |
|---|---|
| `/roll <wyrażenie>` lub `/r` | Rzut kośćmi. Widoczność zgodnie z listą widoczności |
| `/gmroll <wyrażenie>` lub `/gmr` | Tajny rzut, wynik widzi tylko MG |
| `/help` | Lista komend i przykładów |

## Wyrażenia

| Przykład | Znaczenie |
|---|---|
| `/r d10` | jedna k10 |
| `/r 3d100` | trzy k100, zsumowane |
| `/r d100 -1` | k100 minus 1 |
| `/r 2d6 + 1d4 + 3` | różne kości plus premia |
| `/r 4d6kh3` | zachowaj 3 najwyższe |
| `/r 2d20kl1` | zachowaj najniższą |
| `/r 6d10>=7` | policz kości z wynikiem 7 lub więcej |
| `/r d100-10 vs 45` | sukces, gdy wynik wynosi 45 lub mniej |
| `/gmr d20` | widzi tylko MG |

Limity: do 20 kości w jednym składniku i 50 w całym rzucie, kość do 1000 ścian, wyrażenie
do 100 znaków. Liczenie sukcesów (`>=`) musi być jedynym rzutem w wyrażeniu i nie łączy się z `vs`.

## Kto widzi rzut

| Opcja | Widzą |
|---|---|
| Wszyscy | cały stół |
| MG + Gracz | mistrz gry i ty |
| Tylko MG | tylko mistrz gry (ty dostajesz potwierdzenie wysłania) |
| wybrany gracz | ty i ten gracz |

## Statystyki

Twoje rzuty w danej grze są w zakładce **Ogólne**, a ze wszystkich gier w **Ustawieniach**:
liczba rzutów, średnia, krytyczne sukcesy, pechowe rzuty i rozkład wyników.
