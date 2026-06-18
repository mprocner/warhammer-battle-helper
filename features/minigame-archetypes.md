# Minigame Archetypes — design backlog

Pomysły na kolejne minigry **wzbogacające sesję RPG**. Kluczowa obserwacja: nie różnicujemy
gier *tematem* (kości vs karty), tylko **architekturą interakcji**. To ona decyduje o modelu
sieciowym, wyzwaniach inżynierskich i wartości dla sesji.

## Oś różnicująca

Obecne gry kościane (Yahtzee, Dice Poker) to jeden punkt na tej osi:
**turowe, dyskretne, kompetytywne, jawne**. Zmiana każdej z tych własności daje inny gatunek
*i* inny problem inżynierski.

| Archetyp | Model czasu | Kto ma władzę | Nowy problem techniczny |
|---|---|---|---|
| Dice/karty (mamy) | turowy, dyskretny | równi gracze | automat stanów |
| A. Commit-reveal | symultaniczny | równi gracze | ukryta deklaracja + atomowe odsłonięcie |
| B. Real-time skill | ciągły / tick | jeden gra, reszta patrzy | pętla gry, latencja, autorytet serwera |
| C. Asymetryczna łamigłówka co-op | turowy, info asymetryczne | gracze współpracują | filtrowanie stanu per-odbiorca |
| D. GM-host | jeden steruje, reszta reaguje | MG | broadcast asymetryczny + lobby z rolami |

---

## Archetyp A — Commit-Reveal (symultaniczny, nie turowy)

**Gry:** kamień-papier-nożyce na sterydach, blind auction, „pojedynek na spojrzenia".

- **RPG:** szybkie rozstrzyganie pojedynków, zakładów, przepychanek — bez czekania na turę.
- **Nowe technicznie:** brak kolejki tur. Wszyscy **jednocześnie** wysyłają ukryty wybór, serwer
  trzyma go zamkniętego, a gdy wszyscy oddali — **atomowo odsłania**. Analogia: commit-reveal
  z blockchaina (najpierw hash wyboru, potem sam wybór), żeby nikt nie podejrzał i nie zmienił
  decyzji. U nas serwer jest zaufany → wystarczy bufor + flaga gotowości.
- **Pułapka:** jeśli odsłanianie zrobimy po stronie frontu, ktoś z DevTools podejrzy payload.
  Serwer **nie może wysłać** cudzego wyboru, dopóki nie zamknie rundy.

## Archetyp B — Real-time skill (ciągły, jeden gra, reszta kibicuje)

**Gry:** wytrych à la Skyrim (obracaj, znajdź „słodki punkt"), pasek czasu na kradzież
kieszonkową, QTE.

- **RPG:** najmocniejszy pod immersję — zamienia nudny rzut „Skill: Lockpicking" w realną
  mini-zręcznościówkę. Postać coś *robi*, a nie tylko rzuca kostką.
- **Nowe technicznie:** łamie request/response. Potrzebna pętla `requestAnimationFrame` po stronie
  aktywnego gracza; wynik (sukces/porażka) leci do serwera dopiero na końcu. Widzowie dostają
  lekki strumień stanu albo tylko werdykt. Pojawia się latencja i pytanie *kto jest autorytetem*
  — to dylemat netcode'u (client-side prediction vs server authority).
- **Kompromis:** pełna autorytatywność serwera przy 60 FPS jest droga i niepotrzebna dla gry
  single-player-oglądanej. Rozsądnie: **front prowadzi rozgrywkę, backend zapisuje tylko werdykt**
  — bo stawką jest zabawa, nie pieniądze. (Kontrast: rzuty w Yahtzee liczymy w Go, bo tam *jest*
  motywacja do oszustwa.)

## Archetyp C — Asymetryczna łamigłówka co-op

**Gra:** rozbrajanie bomby w stylu *Keep Talking and Nobody Explodes* — jeden widzi „bombę",
reszta ma „instrukcję" i muszą się dogadać.

- **RPG:** genialne do scen z **różną wiedzą** postaci (mag widzi runy, łotrzyk mechanizm).
  Wymusza prawdziwą komunikację głosową przy stole.
- **Nowe technicznie:** wymaga filtrowania stanu **per-odbiorca**. Serwer wysyła graczowi A inny
  widok niż graczowi B. Zmienia `BroadcastToGame` z „jeden payload dla wszystkich" na „payload
  zależny od roli odbiorcy".

## Archetyp D — GM-host (asymetryczna władza)

**Gry:** quiz/lore-trivia z Warhammera, koło fortuny zdarzeń, „licytacja losu".

- **RPG:** MG prowadzi, gracze odpowiadają/obstawiają. Lekkie, dobre na rozgrzewkę sesji.
- **Nowe technicznie:** lobby z rolami (host vs uczestnik) i broadcast asymetryczny (host widzi
  odpowiedzi, gracze nie).

---

## Rekomendacje

- **Najwięcej nauki architektonicznej:** Archetyp B (wytrych real-time) — wyjście poza
  request/response, pętla gry, pytanie o autorytet serwera.
- **Najwięcej wartości dla odgrywania:** Archetyp C (asymetryczna łamigłówka) — wymusza rozmowę
  między graczami.

## Wątki techniczne do przemyślenia przy implementacji

- **Ukryty stan per-gracz** (A, C): serwer musi filtrować payload przed wysłaniem — nie da się
  tego bezpiecznie załatwić ukrywaniem po stronie frontu.
- **Autorytet werdyktu** (B): front liczy wynik dla płynności, backend weryfikuje/zapisuje.
  Skala zaufania zależy od tego, czy ktoś ma motywację oszukiwać.