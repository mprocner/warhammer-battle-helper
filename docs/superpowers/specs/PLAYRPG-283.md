# PLAYRPG-283 — Podgląd karty postaci szablonu z listy systemów

## Cel

W liście systemów przy tworzeniu gry i w „Moich szablonach” nie da się dziś zobaczyć, jak wygląda
karta postaci danego szablonu — trzeba stworzyć grę albo otworzyć kreator. Dodajemy ikonę oka,
która otwiera kartę w popupie: ten sam `CustomSheetBody` co w czystym podglądzie kreatora, w oknie
z belką i X jak karta postaci w sesji.

## Decyzje

| Temat | Decyzja |
|---|---|
| Zakres systemów | Tylko szablony własne (custom: moje, udostępnione, publiczne). Systemy wbudowane (Warhammer 4e, CoC 7e, SRD5) bez oka — ich `CharacterSheet` wymaga prawdziwej postaci i API. |
| Okno | `DraggablePopup` (belka `ModalHeader` z X, przeciąganie, resize) — ta sama ramka co karta w grze. Nie MUI Dialog. |
| Treść | `<div className="custom-sheet">` + `CustomSheetBody` z `showAffordances`, bez `onChange`/`onRoll`/`renderChrome` — dokładnie czysty podgląd kreatora. |
| Dane | `sections` i `settings` z istniejącej listy `useTemplates` (`GET /templates`). Bez nowego requestu, bez zmian w backendzie. |
| Karta wybranego szablonu | Przycisk „Podgląd karty” obok „Więcej” na istniejącej karcie `create-game__selected-about`. Warunek pokazania karty bez zmian (`selectedOption?.description`) — szablon bez opisu nie ma karty, podgląd tylko przez oko w liście. |
| Liczba podglądów | Jeden naraz. Oko przy innym szablonie podmienia zawartość. |

## Komponent `TemplateSheetPreview`

Plik: `warhammer-battle-helper-front/src/components/lobby/TemplateSheetPreview.jsx`.

Kontrakt jak `TemplateDescriptionDialog`: `({ template, onClose })`, otwarty, gdy `template` ustawiony;
`template` to pełny obiekt szablonu z `useTemplates` (`name`, `sections`, `settings`).

Struktura:

```
WindowManagerProvider                      — lokalny, jak w PropertyPopup (DraggablePopup rzuca bez providera)
  DraggablePopup
    title={template.name}
    onClose={onClose}
    initialWidth={clampSheetWidth(template.settings?.sheetWidth)}
    initialPosition="center"
    key={template.id}
    <div className="custom-sheet" style={{ maxWidth: sheetWidth }}>
      <CustomSheetBody sections={template.sections} showAffordances />
```

Okno niezarządzane (bez `windowId`, jak `PropertyPopup`) — nie trafia na listwę, minimalizacja
zwija je w miejscu. `key={template.id}` montuje okno od nowa przy przełączeniu na inny szablon
(świeża pozycja i szerokość z `sheetWidth` nowego szablonu) — `DraggablePopup` liczy rozmiar tylko
przy montażu.

z-index: `.character-sheet-popup` ma 9999, więc popup leży nad MUI Dialogami lobby (1300).
Focus trap MUI Dialogu pod spodem może przejmować focus — przy treści tylko do odczytu bez skutków.

## `CreateGameDialog`

- W `renderOption`: dla `isCustom(opt.value)` ikona `VisibilityOutlinedIcon` obok ⓘ, z
  `aria-label={t('creator.previewSheet')}` i tym samym `onMouseDown` preventDefault +
  stopPropagation (inaczej mousedown wybiera wiersz).
- Szablon do podglądu: `templates.find(tpl => tpl.id === templateIdOf(opt.value))` — opcje z
  `buildSystemOptions` nie niosą sekcji.
- Stan `previewing` (szablon lub `null`) obok `describing`.
- Karta `create-game__selected-about`: przycisk tekstowy z ikoną oka „Podgląd karty” obok „Więcej”.
  Karta pokazuje się tylko dla szablonów (wbudowane nie mają opisu), więc przycisk nie potrzebuje
  dodatkowego warunku.
- Zamknięcie dialogu zamyka podgląd: `previewing` czyszczony w efekcie `[open]` razem z resztą
  formularza, a `TemplateSheetPreview` renderowany tylko gdy `open`.

## `TemplateManagerDialog`

- Oko jako pierwsza ikona w grupie akcji (`secondaryAction`), dla każdego szablonu (każdy widoczny
  szablon ma uprawnienie `use`). Portal tooltip `t('creator.previewSheet')`.
- Stan `previewing` obok `describing`.
- „Edytuj” czyści `previewing` przed `onEditTemplate` — inaczej popup (9999) przykryłby
  pełnoekranowy kreator.
- Podgląd renderowany tylko gdy `open`.

## i18n

Nowy klucz `creator.previewSheet`: en „Preview character sheet”, pl „Podgląd karty postaci”.
Używany jako tooltip/aria-label oka i etykieta przycisku na karcie.

Tutorial kreatora bez zmian — sam kreator nie jest modyfikowany.

## Testy

- `TemplateSheetPreview.test.jsx`: przy `template` renderuje `.custom-sheet` z treścią sekcji i
  tytułem; X wywołuje `onClose`; przy `template={null}` nic nie renderuje.
- `CreateGameDialog.test.jsx`: oko tylko przy szablonach własnych; kliknięcie oka otwiera podgląd i
  nie zmienia wyboru; przycisk na karcie wybranego szablonu otwiera podgląd.
- `TemplateManagerDialog.test.jsx`: oko otwiera podgląd; „Edytuj” go zamyka.

## Poza zakresem

- Podgląd systemów wbudowanych (osobny ticket, jeśli kiedyś potrzebny).
- Podgląd skrótu karty (short card) i tokena.
