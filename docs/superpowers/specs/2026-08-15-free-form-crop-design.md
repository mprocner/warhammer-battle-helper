# FEATURE-167 — Swobodne proporcje kadru: zamiana react-easy-crop na react-image-crop

Data: 2026-08-15

Poprzednik: `2026-08-15-image-crop-scale-upload-design.md` (FEATURE-132), zmergowany
jako `f53be7c`.

## Problem

FEATURE-132 dało kadrowanie we wszystkich ścieżkach uploadu obrazów, ale **proporcji
kadru nie da się zmienić**. `react-easy-crop` nie ma trybu swobodnego: prop `aspect`
jest zawsze liczbą, domyślnie `4/3`, a jedyna alternatywa (`cropSize`) jest w README
biblioteki wprost odradzana. Nie da się chwycić rogu ramki i wyciągnąć dowolnego
prostokąta.

Obecne obejście — `resolveAspect`, dopisane pod koniec FEATURE-132 — sprawia, że
preset bez własnego `aspect` dostaje proporcje samego obrazu. Ramka startowa obejmuje
więc cały obraz, ale użytkownik dalej może ją tylko pomniejszać proporcjonalnie.

## Zakres

W zakresie: wymiana biblioteki kadrującej i wnętrze `ImageCropModal`. Poza zakresem:
`processImage` i cały pipeline przetwarzania, presety, cztery miejsca wywołania,
backend. Te pozostają bez zmian — patrz D5.

## Decyzje

### D1 — `react-image-crop` 11.1.2

`react-image-crop` obsługuje kadr swobodny wprost: `aspect: undefined` znaczy
swobodnie, a nie „domyślnie 4:3". Biblioteka nie rysuje obrazu sama — dostaje nasz
własny `<img>` jako dziecko i nakłada na niego wyłącznie ramkę zaznaczenia. To
przesuwa kontrolę nad obrazem do nas i jest podstawą decyzji D3.

Wchodzi też `react-image-crop/dist/ReactCrop.css`. `react-easy-crop` znika z
`package.json`.

### D2 — `resolveAspect` zostaje usunięty

Funkcja powstała wyłącznie po to, żeby obejść domyślne `4/3` w starej bibliotece: dla
presetu bez `aspect` liczyła proporcje ze źródła, bo przekazanie `undefined` włączało
4:3 zamiast je wyłączyć. W `react-image-crop` `undefined` znaczy dokładnie to, co
powinno, więc `preset.aspect ?? undefined` wystarcza.

Kasujemy funkcję i jej cztery testy. To jedyny fragment czystego modułu, który ta
zamiana niszczy — i powstał dokładnie dlatego, że zachowanie konkretnej biblioteki
wyciekło poza warstwę, która ją opakowuje. Patrz D6.

### D3 — Zoom przez szerokość obrazu, nie przez `transform`

Suwak powiększenia zostaje. Realizuje go **rzeczywista szerokość** obrazu —
`style={{ width: `${zoom * 100}%` }}` — w kontenerze z `overflow: auto`, a nie
`transform: scale()`.

Powód jest rachunkowy. `transform: scale()` powiększa obraz wizualnie, ale **nie
zmienia jego pudełka layoutu**, więc ramka kadru mierzy się dalej względem
niepowiększonego prostokąta. Rozjazd trzeba potem odkręcać — dlatego helpery
biblioteki przyjmują osobny argument `scale`. Przy zmianie szerokości obraz naprawdę
jest większy, ramka mierzy się względem niego, a `percentCrop` pozostaje wprost
prawdziwy. Najbardziej ryzykowny fragment całej zamiany po prostu nie powstaje.

Koszt: panoramowanie paskami przewijania zamiast przeciągania obrazu. Nie jest to
realna strata — przeciągnięcie po obrazie tworzy ramkę, więc gest przeciągania i tak
jest zajęty.

### D4 — „Nie ruszałem ramki" rozpoznawane przez flagę, nie przez próg

Stan `touched`, ustawiany w `onChange`. Biblioteka woła `onChange` tylko przy
przeciąganiu i zmianie rozmiaru, a ramka startowa mieści się w granicach obrazu, więc
nic nie wywoła jej samo z siebie. Rozpoznanie jest **dokładne**.

Odrzucone: porównywanie, czy zaznaczenie ma 100% szerokości i wysokości, z tolerancją
na błąd zmiennoprzecinkowy. Próg ma dwa błędy o bardzo różnej wadze. Zbyt ciasny
powoduje niepotrzebne przekodowanie — szkoda kosmetyczna. Zbyt luźny **ignoruje
świadome przycięcie** o ułamek procenta i oddaje obraz, którego użytkownik nie prosił.
Flaga nie ma ani jednego z tych błędów.

`touched` nie wraca do `false`. Jeśli ktoś przeciągnie ramkę i wróci nią do pełnego
obrazu, plik zostanie przekodowany mimo braku efektywnego kadru. Przyjęte świadomie —
szkoda jest kosmetyczna, a wykrywanie „wrócił do całości" wymagałoby dokładnie tego
progu, który D4 odrzuca.

Po co to w ogóle: gdy kadr jest pusty, `processImage` dostaje `cropArea = null`, więc
działa istniejący passthrough i obraz mieszczący się w limitach wychodzi **oryginalny,
bez stratnego przekodowania**. Token PNG otwarty i zatwierdzony bez zmian zostaje bajt
w bajt taki sam.

### D5 — Reguła z D4 obowiązuje wyłącznie presety bez wymuszonego aspektu

```js
const cropArea = (preset.aspect == null && !touched)
  ? null
  : percentCropToSourceRect(crop.x, crop.y, crop.width, crop.height, naturalWidth, naturalHeight);
```

Przy `avatar` i `gameImage` ramka startowa to **wyśrodkowany prostokąt o wymuszonych
proporcjach**, czyli już jest kadrem. Potraktowanie „nie ruszałem" jako braku
kadrowania wysłałoby tam niekwadratowy avatar w całości — dokładnie ta klasa błędu,
przed którą FEATURE-132 broniło się blokadą przycisku zatwierdzenia.

Dla `handout` i `libraryImage` ramka startowa obejmuje cały obraz, więc brak kadru
znaczy dokładnie to, na co wygląda.

### D6 — Czysta warstwa nie zna typów biblioteki

Nowa funkcja przyjmuje zwykłe liczby, nie obiekt `PercentCrop`:

```js
percentCropToSourceRect(xPct, yPct, widthPct, heightPct, naturalWidth, naturalHeight)
  -> { x, y, width, height }   // piksele źródła, zaokrąglone
```

Rozpakowanie obiektu biblioteki zostaje w komponencie — czyli w warstwie, którą i tak
się wymienia. Gdyby przyszła trzecia biblioteka raportująca kadr inaczej, ta funkcja
przetrwa bez zmian, mimo że jej matematyka jest uniwersalna.

To jest wniosek wyciągnięty z D2: `resolveAspect` ginie właśnie dlatego, że tej
granicy nie utrzymał.

### D7 — Bez własnej warstwy abstrakcji nad kadrownikiem

Świadomie **nie** wprowadzamy własnego interfejsu (`<CropCanvas>` czy podobnego), pod
który podpinałoby się dowolną bibliotekę.

Granica już istnieje i ta zamiana ją weryfikuje: propsy `ImageCropModal`
(`{ file, preset, onConfirm, onCancel }`) nie zawierają żadnego pojęcia z biblioteki,
a pipeline potrzebuje od kadrownika jednej rzeczy — prostokąta w pikselach źródła,
który potrafi wyprodukować każda biblioteka tego rodzaju. Dlatego cztery miejsca
wywołania, `processImage`, presety, predykaty i backend przechodzą tę zamianę bez
jednej zmiany.

Dodatkowa warstwa kosztowałaby plik do utrzymania dziś, przy jednym konsumencie, żeby
oszczędzić kilka godzin w scenariuszu, który może nie nastąpić. Koszt kolejnej zamiany
i tak zamyka się w jednym komponencie, jego stylach i jego testach.

## Architektura

### `src/utils/imageProcessing.js`

Usunięte: `resolveAspect` i jego cztery testy.

Dodane: `percentCropToSourceRect` (sygnatura w D6). Zaokrągla do pełnych pikseli.
To cała matematyka, jaka zostaje po wyborze z D3.

Reszta modułu — `PRESETS`, `computeTargetSize`, `shouldPassthrough`,
`sourceMayHaveAlpha`, `pickEncoding`, `processImage`, obie stałe progowe — bez zmian.

### `src/components/common/ImageCropModal.jsx`

Stan: `imageSrc`, `crop` (procentowy), `touched`, `zoom`, `naturalSize`, `busy`,
`error`. Znika `croppedAreaPixels` i `mediaAspect`.

```jsx
<div className="image-crop-modal__area">        {/* overflow: auto */}
  <ReactCrop
    crop={crop}
    onChange={(_, pc) => { setCrop(pc); setTouched(true); }}
    aspect={preset.aspect ?? undefined}
    keepSelection
  >
    <img
      ref={imgRef}
      src={imageSrc}
      style={{ width: `${zoom * 100}%` }}
      onLoad={onImageLoad}
    />
  </ReactCrop>
</div>
```

`onImageLoad` zapisuje `naturalWidth`/`naturalHeight` i ustawia ramkę startową:

- preset bez `aspect` → `{ unit: '%', x: 0, y: 0, width: 100, height: 100 }`
- preset z `aspect` → `centerCrop(makeAspectCrop({ unit: '%', width: 100 }, preset.aspect, naturalWidth, naturalHeight), naturalWidth, naturalHeight)`, helpery z biblioteki

Blokada przycisku zatwierdzenia zmienia podstawę z `!croppedAreaPixels` na brak
znanego `naturalSize`. Cel ten sam: nie da się zatwierdzić, zanim obraz się wczyta.

Bez zmian: `createPortal` do `document.body`, `await onConfirm`, mapowanie błędów po
`reason`, reset całego stanu w efekcie kluczowanym na `file`, suwak zoomu.

### `src/components/common/ImageCropModal.css`

`.image-crop-modal__area` staje się kontenerem przewijanym (`overflow: auto`) o stałej
wysokości. Znikają style zakładające, że biblioteka sama pozycjonuje obraz.

### Miejsca wywołania

`GeneralTab`, `AvatarUpload`, `HandoutCreateModal`, `FilesTab` — **bez zmian**.

## Testy

`percentCropToSourceRect` dostaje testy przed implementacją: obraz poziomy i pionowy,
kadr w rogu, kadr pełny (100% → pełne wymiary źródła), zaokrąglanie wyniku ułamkowego.

Sześć istniejących testów `ImageCropModal` przechodzi na atrapę `react-image-crop`,
w tym samym stylu co obecna: jeden mock modułowy przełączany zmienną z prefiksem
`mock`, bez `jest.resetModules` (który pod CRA ładuje drugą instancję Reacta i wywala
się na „Invalid hook call" — udokumentowane w FEATURE-132).

Dochodzą dwa testy pilnujące D5:

- preset bez `aspect`, ramka nietknięta → `processImage` dostaje `null` jako `cropArea`
- preset z `aspect`, ramka nietknięta → `processImage` dostaje prostokąt

Drugi z nich jest istotny: bez niego regresja polegająca na rozciągnięciu reguły z D4
na wszystkie presety przechodziłaby niezauważona, a jej skutkiem jest niekwadratowy
avatar.

## Ryzyko do weryfikacji ręcznej

**EXIF.** Ramkę mierzymy na tym, co narysowała przeglądarka, a wycinamy przez
`createImageBitmap` z `imageOrientation: 'from-image'`. Obie ścieżki powinny stosować
obrót identycznie — `naturalWidth`/`naturalHeight` w nowoczesnych przeglądarkach są
już po obrocie — ale README `react-image-crop` ostrzega przed tym problemem wprost.
Wymaga próby na prawdziwym zdjęciu z telefonu; wygenerowane pliki testowe nie mają
danych EXIF i tego nie pokryją.

**Przewijanie przy dużym zoomie.** Kontener przewijany z ramką kadru to interakcja,
której żaden test w tym repozytorium nie zobaczy. Sprawdzić na mapie 6000 px przy
maksymalnym powiększeniu.
