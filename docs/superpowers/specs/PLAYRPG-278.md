# PLAYRPG-278 — Alfabetyczna lista umiejętności w kolumnie broni „opcje z umiejętności”

## Problem

Kolumna `select` z `optionsFromSkills` w tabeli broni pokazuje umiejętności w kolejności zbierania:
pola umiejętności w kolejności szablonu, w każdym kolejność MG, umiejętności gracza doklejone na
końcu. Przy dłuższej liście trudno znaleźć umiejętność po nazwie. Dotyczy dwóch miejsc:

- gra — select w wierszu broni (`WeaponsTable.jsx`);
- kreator — select umiejętności przy definiowaniu predefiniowanej broni (`TablePresetsEditor`,
  zasilany z `TemplateBuilder.jsx`).

Flaga `sortAlphabetically` tabeli umiejętności tej listy nie dotyczy — sortuje tylko arkusz tabeli
(`buildSkillRows`).

## Decyzje

| Temat | Decyzja |
|---|---|
| Reguła | Lista zawsze alfabetycznie po etykiecie, niezależnie od flag pól umiejętności. Wybierając umiejętność do broni, użytkownik zna jej nazwę — posortowany zbiór łatwiej przeszukać. |
| Miejsce | `collectSkillOptions` (`systems/custom/skillLayout.js`). Obie ścieżki (gra, kreator) dostają zmianę z jednego miejsca. |
| Flaga | Brak nowej. |
| Backend / dane | Bez zmian — select zapisuje `key`, nie pozycję. |

## Zmiana

`collectSkillOptions` sortuje wynik przed zwrotem:

```js
return out.sort((a, b) => a.label.localeCompare(b.label));
```

`localeCompare` bez argumentów — ten sam porządek co `buildSkillRows`, więc arkusz tabeli
z włączonym sortowaniem i select broni układają te same nazwy identycznie.

Komentarz nad funkcją: poprawić nieaktualne „jedynym wywołującym jest `WeaponsTable.jsx`” (woła ją
też `TemplateBuilder`) i dopisać, że lista jest alfabetyczna oraz dlaczego.

## Świadome skutki

- Umiejętności gracza nie są już na końcu — wchodzą alfabetycznie między szablonowe.
- Węzły `skill_tree` sortowane płasko razem z resztą; select i dziś nie pokazuje hierarchii.
- Kolejność ułożona przez MG przeciąganiem (PLAYRPG-267) nie wpływa na ten select; na arkuszu tabeli
  umiejętności działa bez zmian.
- Inni odbiorcy `skillOptions` (`columnOptions`, `cellLabel`) szukają po kluczu — kolejność ich nie
  dotyczy.
- Brak zamrażania etykiet (jak `sortLabels` w `buildSkillRows`): podczas zmiany nazwy umiejętności
  fokus jest w polu tabeli umiejętności, nie w zamkniętym selekcie broni, więc przestawienie opcji
  nie ucieka nikomu spod kursora.

## Testy

`systems/custom/skillLayout.test.js`:
- dwa `skill_table` + umiejętność gracza, ułożone niealfabetycznie → jedna lista alfabetyczna,
  umiejętność gracza w środku;
- istniejące asercje na `collectSkillOptions` zależne od kolejności — dostosować do sortowania.

Tutorial i i18n bez zmian (brak nowego pola, grupy, tekstu).

Weryfikacja ręczna: w kreatorze dodać predefiniowaną broń i otworzyć select umiejętności; w grze
otworzyć select umiejętności w wierszu broni — obie listy alfabetycznie.
