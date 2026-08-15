# FEATURE-132 — Kadrowanie i skalowanie obrazów przy uploadzie

Data: 2026-08-15

## Problem

Kadrowanie obrazu istnieje dziś w jednym miejscu — przy ustawianiu kafelka gry w
`GeneralTab.jsx`. Pozostałe trzy ścieżki uploadu obrazów (avatar postaci, obrazek
handoutu, biblioteka plików) wysyłają plik surowy, bez kadrowania i bez skalowania.
Efekty:

- avatar wgrany jako portret w pionie zostaje przycięty automatycznie i losowo przez
  CSS, bez kontroli użytkownika;
- mapa 6000×4000 px trafia na serwer w oryginale albo odbija się od limitu 5 MB;
- logika kadrowania jest zamknięta w `GeneralTab` i nie da się jej użyć ponownie.

## Zakres

W zakresie: cztery ścieżki uploadu obrazów — kafelek gry, avatar postaci, obrazek
handoutu, biblioteka plików (`FilesTab`). Poza zakresem: upload muzyki (limit 50 MB
zostaje bez zmian), PDF i TXT w handoutach (nie da się ich skalować).

## Decyzje

### D1 — Kadrowanie przy pojedynczym obrazie, samo skalowanie przy wielu

Zasada obowiązująca w całej aplikacji: **pojedynczy obraz otwiera kadrownik, wiele
obrazów naraz przechodzi tylko przez skalowanie.**

Kadrowanie każdego z dwudziestu plików po kolei jest męczarnią, a `FilesTab` to
biblioteka assetów — mapy wstawia się na scenę, która ma własny transform, więc
kadrowanie przy wgrywaniu rzadko jest potrzebne. Skalowanie jest potrzebne zawsze.

Kadrowanie w bibliotece pozostaje dostępne po fakcie, jako osobna akcja na pliku
(D5).

### D2 — Kadrowanie pliku w bibliotece tworzy kopię

Przycięcie pliku leżącego już w bibliotece zapisuje **nowy** plik obok oryginału.
Oryginał zostaje nietknięty, sceny go używające działają dalej.

Alternatywa — nadpisanie w miejscu — została odrzucona jako nieproporcjonalnie droga.
`SceneImage` (`models/Game.go:431`) wskazuje plik przez `FileURL` (string), nie przez
`fileId`, a jeden plik bywa używany w wielu scenach i wielu grach (istnieje endpoint
`GET /files/:fileId/usage` właśnie po to). Nadpisanie wymagałoby nowego endpointu na
podmianę treści, cache-bustingu (nazwa pliku to UUID, więc ten sam URL oznacza stary
obraz w cache przeglądarki), przeliczenia `width`/`height` w każdej `SceneImage`
wskazującej ten URL we wszystkich grach oraz modala ostrzegawczego. Kopia nie wymaga
żadnej zmiany w backendzie — to zwykłe `POST /files/upload` z tym samym `folderId`.

Przyjęty koszt: duplikaty w bibliotece i to, że scena dalej trzyma stary obraz.
Akceptowalny, bo główna ścieżka to „przytnij zanim wstawisz".

### D3 — Format wyjściowy zależny od wielkości: PNG poniżej 1 MP, WebP powyżej

```js
export const PNG_MAX_PIXELS = 1024 * 1024;   // 1 MP

pickEncoding(width, height)
  -> { type: 'image/png',  quality: undefined }  // gdy w * h <= PNG_MAX_PIXELS
  -> { type: 'image/webp', quality: 0.85 }       // w przeciwnym razie
```

Wymiary w regule to wymiary **wyniku**, po skalowaniu i kadrowaniu, nie źródła.

Punkt wyjścia: `canvas.toBlob` **zawsze koduje od zera**. Canvas trzyma surowe RGBA
i nie pamięta, w czym obraz przyszedł, więc ścieżka „przeskaluj, ale zachowaj
oryginalne kodowanie" nie istnieje. To samo dotyczy kadrowania. Wybór nie brzmi
„kodować czy nie", tylko „którym koderem".

Obecny `cropImageToBlob` w `GeneralTab.jsx:38` wypluwa zawsze JPEG. Dla kafelka gry to
działa, ale JPEG nie ma kanału alfa — token z przezroczystym tłem wgrany przez
`FilesTab` dostałby czarne albo białe tło. Odpada.

Zostają PNG i WebP, i one wygrywają w rozłącznych przedziałach wielkości.

**Czemu nie sam PNG.** PNG kompresuje bezstratnie, algorytmem DEFLATE po przefiltrowanych
rzędach pikseli. Świetnie radzi sobie z płaskimi barwami i ostrymi krawędziami, fatalnie
z gradientami, teksturami i szumem. Mapa 4096×4096 waży w PNG 20–40 MB wobec 1,5–3 MB
w WebP q0.85 — różnica dziesięcio- do piętnastokrotna. Uderza w trzy miejsca: plik nie
mieści się w limicie 15 MB (D6); biblioteka trzydziestu map zajmuje 1 GB zamiast 60 MB;
a przede wszystkim **obraz sceny pobiera każdy gracz przy każdym przełączeniu sceny** —
pięciu graczy razy 30 MB to 150 MB z łącza serwera na jedno przełączenie, czyli minuty
patrzenia w pustą mapę. Sam PNG byłby wykonalny tylko przy mapach rzędu 1500 px, co
unieważnia D4.

**Czemu nie sam WebP.** `canvas.toBlob` nie wystawia trybu bezstratnego WebP, więc każde
wyjście byłoby stratne — także tam, gdzie bezstratność jest tania. Token 250×250 w PNG
to około 60 KB; oszczędność z kompresji stratnej jest tu bez znaczenia, a koszt realny:
ostry kontur na przezroczystym tle dostaje przy stratnej kompresji brudną obwódkę,
i narasta to przy każdym kolejnym kadrowaniu tego samego pliku.

Próg po wielkości dobrze pokrywa się z rodzajem treści w tej aplikacji: małe obrazy to
tokeny i avatary, czyli grafika płaska, gdzie PNG jest bezstratny *i* mały; duże to
malowane mapy, gdzie PNG jest bezstratny i nie do uniesienia. Pod tą regułą avatar (512),
kafelek gry (800×640) i każdy przycięty token wychodzą bezstratnie, a stratna kompresja
dotyka wyłącznie map i dużych handoutów, gdzie PNG i tak jest nie do użycia.

Backend akceptuje oba formaty bez zmian (`storage/local.go:35–38`).

**Ścieżka zapasowa** dotyczy tylko gałęzi WebP — PNG jest wspierany wszędzie, gdzie
canvas w ogóle działa. Jeśli `toBlob` zwróci `null` dla WebP, powtarzamy z `image/jpeg`
q0.85, ale **tylko dla źródeł bez kanału alfa** (czyli JPEG). Dla źródłowego PNG albo
WebP zwracamy błąd i pomijamy plik. Bezwarunkowa ścieżka zapasowa byłaby szkodliwa:
token z przezroczystym tłem dostałby po cichu tło czarne. Rozpoznanie po typie MIME
wystarczy — JPEG z definicji nie ma alfy, PNG i WebP mogą ją mieć.

Świadomie odrzucone: kodowanie do PNG i sięganie po WebP dopiero gdy wynik przekroczy
budżet bajtów. Reguła byłaby samostrojąca, ale kodowanie PNG obrazu 4096×4096 to ~1–2 s
pracy, którą przy szeregowej pętli w `FilesTab` płaci się za każdy plik dwa razy. Próg
liczony z wymiarów kosztuje jedno mnożenie.

### D4 — Limity rozmiaru per zastosowanie

Jeden globalny limit pikseli nie działa: avatar wyświetlany w kółku nie potrzebuje
więcej niż 512 px, a mapa bitewna przy 512 px to rozmazana plama przy zoomie. Limit
jest polem presetu.

| Preset | Dłuższa krawędź | Proporcje | Kadrownik |
|---|---|---|---|
| `avatar` | 512 px | 1:1 wymuszone | tak |
| `gameImage` | 800 px | `GAME_IMAGE_ASPECT` (5/4) | tak |
| `handout` | 2048 px | swobodne | tak |
| `libraryImage` | 4096 px | swobodne | nie (patrz D5) |

4096 px dla map to jakość porównywalna z Foundry VTT, ostra przy mocnym zoomie.
W WebP q0.85 to zwykle 1,5–3 MB.

Kolumna „Kadrownik" opisuje zachowanie miejsca wywołania, nie pole presetu.

### D5 — Kadrowanie w bibliotece jako ikona przy pliku

`DraggableFileItem.jsx:83` ma już rząd ikon (dodaj do sceny / zmień nazwę / usuń).
Kadrowanie dochodzi jako czwarta ikona `CropIcon`. Menu kontekstowe pod prawym
przyciskiem zostało odrzucone — wprowadzałoby nowy mechanizm (portal, pozycjonowanie,
zamykanie na klik poza obszarem) dla jednej akcji, przy istniejącym i działającym
wzorcu obok.

### D6 — Limit rozmiaru pliku: 5 MB → 15 MB

`storage.MaxFileSize` rośnie z 5 MB do 15 MB.

5 MB było kalibrowane na czasy, gdy klient wysyłał plik surowy — limit służył za
hamulec przed wgraniem zdjęcia prosto z aparatu. Po wprowadzeniu skalowania po stronie
klienta jego rola się zmienia: staje się siatką bezpieczeństwa na wypadek ominięcia
frontendu i strzału prosto w API. Siatka bezpieczeństwa może być luźniejsza.

Przy 4096 px mapa rysowana ręcznie, z dużą ilością detalu i tekstur, kompresuje się
gorzej niż fotografia i potrafi dobić do 4–6 MB. Przy limicie 5 MB trafiałaby w ścianę
losowo, zależnie od „szumności" obrazka — błąd nie do przewidzenia po obejrzeniu pliku.

Ta sama stała obsługuje handouty (`HandoutHandler.go:35`), gdzie siedzi PDF, którego
nie da się przeskalować. Zeskanowany handout ponad 5 MB to realny problem dzisiaj, więc
podniesienie pomaga w obu miejscach naraz. Limit muzyki (50 MB) bez zmian.

### D7 — GIF zablokowany przy uploadzie

`image/gif` znika z list dozwolonych typów uploadu.

Canvas widzi tylko pierwszą klatkę, więc przepuszczenie animowanego GIF-a przez
skalowanie zamieniłoby go w obrazek statyczny. Wyjątek („GIF przechodzi nietknięty")
kosztowałby gałąź w `processImage`, ukrywanie ikony kadrowania w `DraggableFileItem`
oraz plik omijający limit `maxEdge` — animowany GIF 3000 px szedłby na serwer
nieprzeskalowany. Blokada wejścia usuwa to wszystko naraz i zostawia pipeline z jedną
ścieżką.

Statyczny GIF nie jest przy tym niczego wart: 256 kolorów i kompresja gorsza od WebP
o rząd wielkości. Tracimy wyłącznie animowane tokeny — sztuczkę lubianą w Foundry
i Roll20, niszową i możliwą do przywrócenia później osobnym ficzerem.

Istniejące dane pozostają sprawne, ale **wymaga to osobnej zmiany**. Pierwotnie
zapisałem tu, że listy dozwolonych typów filtrują wyłącznie upload. To było błędne:
`LocalStorage.Get` (`storage/local.go:146`) ustala `Content-Type` serwowanego pliku,
przeszukując te same listy **odwrotnie**, po rozszerzeniu. Usunięcie `image/gif`
z list sprawiłoby więc, że zapisane wcześniej GIF-y zaczęłyby wychodzić jako
`application/octet-stream`.

Poprawka: serwowanie dostaje własną mapę `ServedContentTypes`, kluczowaną po
rozszerzeniu, i `Get` korzysta wyłącznie z niej. To rozprzęga „co serwer przyjmuje"
od „co serwer oddaje" — dwie rzeczy, które właśnie się rozjechały i nie ma powodu,
by dzieliły jedną strukturę.

Przy okazji znika istniejąca usterka: `AllowedMusicTypes` mapuje na `.wav` zarówno
`audio/wav`, jak i `audio/x-wav`, a Go losuje kolejność iteracji po mapie — więc plik
`.wav` serwował się raz jako jeden typ, raz jako drugi.

Przyjęte ograniczenie: animowany WebP ma ten sam problem, a nie jest blokowany, bo WebP
to nasz format wyjściowy. Taki plik przejdzie przez canvas i wyjdzie jako pojedyncza
klatka. Skutek widać natychmiast w miniaturze biblioteki, więc jest to widoczna
niespodzianka, nie cicha utrata danych.

## Architektura

### Warstwa czysta — `src/utils/imageProcessing.js`

Bez Reacta, bez `fetch`, bez i18n.

```js
// Preset carries the limit and the proportions only. Whether a path shows the
// cropper is decided by the call site: FilesTab uses libraryImage both ways —
// bulk upload without the modal, single-file crop with it — so a `crop` flag
// here would be dead weight.
export const PRESETS = {
  avatar:       { maxEdge: 512,  aspect: 1 },
  gameImage:    { maxEdge: 800,  aspect: GAME_IMAGE_ASPECT },
  handout:      { maxEdge: 2048, aspect: null },
  libraryImage: { maxEdge: 4096, aspect: null },
};

export const MAX_SOURCE_BYTES = 80 * 1024 * 1024;
export const PNG_MAX_PIXELS = 1024 * 1024;

export function computeTargetSize(srcW, srcH, maxEdge) -> { width, height }
export function shouldPassthrough(preset, cropArea, srcW, srcH) -> boolean
export function sourceMayHaveAlpha(file) -> boolean
export function pickEncoding(width, height) -> { type, quality }
export async function processImage(file, preset, cropArea = null) -> File
```

`GAME_IMAGE_ASPECT` przenosi się tutaj z `GeneralTab.jsx:28`. Dziś komponent widoku
eksportuje stałą domenową, co jest odwróconą zależnością.

Kroki `processImage`:

1. Strażnik na wejściu — `file.size > MAX_SOURCE_BYTES` kończy się błędem, **zanim
   cokolwiek zostanie zdekodowane** (uzasadnienie niżej). Działa na bajtach, więc jako
   jedyny sprawdzian może wyprzedzić dekodowanie.
2. `createImageBitmap(file, { imageOrientation: 'from-image' })`. Drugi argument jest
   konieczny — zdjęcia z telefonu noszą obrót w EXIF, a `drawImage` bez niego rysuje
   avatar położony na boku.
3. `shouldPassthrough(preset, cropArea, bitmap.width, bitmap.height)` — jeśli nie ma
   `cropArea` i obraz mieści się w `maxEdge`, `bitmap.close()` i zwróć **oryginalny
   `File`**. Bez tego bezstratny PNG 900 px przechodziłby stratną konwersję bez powodu.
4. `computeTargetSize` — skala to `min(1, maxEdge / max(w, h))`. Nigdy nie
   powiększamy; rozciągnięcie tokena 200 px do 4096 px to sam szum i megabajty.
5. `ctx.imageSmoothingQuality = 'high'` przed rysowaniem. Wartość domyślna to `'low'`,
   a przy dużym skoku skali (mapa 10000 px → 4096 px) domyślne filtrowanie daje
   widoczny aliasing na cienkich liniach.
6. `drawImage` z prostokątem źródłowym `cropArea` albo całym obrazem.
7. `bitmap.close()` natychmiast po `drawImage`.
8. `pickEncoding(targetW, targetH)` i `canvas.toBlob` z wybranym typem oraz jakością;
   nazwa `<podstawa>.png` albo `<podstawa>.webp`, zgodnie z tym, co wyszło.

Sprawdzenie z kroku 3 **musi** wypaść po dekodowaniu, bo potrzebuje wymiarów obrazu,
a wymiarów nie da się w przeglądarce poznać taniej — i `createImageBitmap`, i
`new Image()` dekodują całość. Passthrough oszczędza więc ponowne **kodowanie**, nie
dekodowanie; to kodowanie jest jedynym krokiem stratnym, więc korzyść pozostaje.

**Dlaczego strażnik i `close()`.** `createImageBitmap` rozpakowuje obraz do surowego
RGBA, niezależnie od tego jak dobrze był skompresowany na dysku. PNG 10000×10000 to
10000 × 10000 × 4 = **400 MB** w pamięci przeglądarki, przy pliku źródłowym rzędu
100 MB. Limit `MaxFileSize` tego nie łapie, bo dotyczy tego, co wychodzi na serwer po
przetworzeniu — użytkownik może więc wybrać plik, który wywali kartę przeglądarki,
zanim jakikolwiek bajt poleci w sieć. Stąd próg na `file.size` przed dekodowaniem.

`bitmap.close()` zwalnia te setki megabajtów natychmiast, zamiast czekać, aż zbierze je
garbage collector. Ma to znaczenie właśnie dlatego, że `FilesTab` przetwarza pliki
szeregowo w pętli — bez jawnego zwolnienia dwadzieścia dużych map kumuluje gigabajty
zanim GC zdąży zareagować.

**Znany limit powierzchni canvasu.** Safari na iOS odrzuca canvas powyżej 16 777 216
pikseli powierzchni, a preset `libraryImage` przy obrazie kwadratowym daje
4096 × 4096 = dokładnie 16 777 216. Na takich urządzeniach `toBlob` zwróci `null`,
co uruchamia ścieżkę zapasową z D3: JPEG dla źródeł bez alfy, błąd dla PNG i WebP.
Aplikacja jest narzędziem stołowym używanym na desktopie, więc nie zmieniamy dla tego
przypadku limitu presetu — wystarczy, że degradacja jest jawna i nie psuje
przezroczystości po cichu.

### Warstwa UI — `src/components/common/ImageCropModal.jsx`

Propy: `file`, `preset`, `onConfirm(processedFile)`, `onCancel`.

W środku `react-easy-crop` ze stanem `crop` / `zoom` / `croppedAreaPixels` — kod
przeniesiony z `GeneralTab.jsx:63–118` bez zmian w logice. `aspect={preset.aspect ??
undefined}` — `undefined` oznacza w `react-easy-crop` swobodne proporcje.

Kadrownik startuje z ramką obejmującą cały obraz, więc „nie chcę przycinać" to
zatwierdzenie bez dotykania czegokolwiek.

Style przenoszą się z `GeneralTab.css:658–716` do nowego `ImageCropModal.css`
z prefiksem `.image-crop-modal` zamiast `.game-image-cropper`. Stare klasy i stary kod
kadrowania w `GeneralTab` znikają w tej samej zmianie.

### Miejsca wywołania

| Plik | Zmiana |
|---|---|
| `GeneralTab.jsx` | Traci własny kadrownik i `cropImageToBlob`. Zostaje `<ImageCropModal preset={PRESETS.gameImage}>` plus wysyłka. |
| `AvatarUpload.jsx` | Nowy stan `pickedFile`. Po wyborze pliku nie wysyła od razu — pokazuje modal z `PRESETS.avatar`, wysyła dopiero z `onConfirm`. |
| `HandoutCreateModal.jsx` | Modal tylko dla obrazów. PDF i TXT idą starą ścieżką prosto do `uploadHandoutFile`. |
| `FilesTab.jsx` | Bez modala przy uploadzie. `handleUpload` (`:257`) przepuszcza pliki przez `processImage(f, PRESETS.libraryImage)` szeregowo, z licznikiem postępu, potem jeden `POST /files/upload`. |
| `DraggableFileItem.jsx` | Nowa ikona `CropIcon` w rzędzie akcji (`:83`). |

Przetwarzanie w `FilesTab` jest **szeregowe**, nie przez `Promise.all` — dekodowanie
i narysowanie obrazu 4096 px to około 100 ms głównego wątku. Dwadzieścia plików
równolegle zamraża UI na kilka sekund bez informacji zwrotnej; szeregowo z `await`
sterowanie wraca do pętli zdarzeń między plikami i da się pokazać postęp „3/20".
Worker z `OffscreenCanvas` usunąłby zacinanie do końca, ale wymaga konfiguracji workera
w CRA — nieopłacalne przy tej skali.

### Przepływ kadrowania w bibliotece

Klik na `CropIcon` pobiera plik z jego URL-a (`fetch` → `blob`; to samo origin, więc
canvas się nie zabrudzi) i otwiera `ImageCropModal` z presetem `libraryImage`.
`onConfirm` wysyła nowy plik do tego samego
`folderId` pod nazwą z sufiksem `t('files.croppedSuffix')`. Oryginał zostaje, sceny
nietknięte, backend bez zmian.

## Zmiany w backendzie

Żadna nie dotyka logiki biznesowej.

1. `storage/local.go:52` — `MaxFileSize` z `5 * 1024 * 1024` na `15 * 1024 * 1024`,
   wraz z komentarzem dokumentacyjnym nad stałą (`:51`), który podaje 5MB.
2. Nowa stała `storage.MaxMultipartMemory = 32 * 1024 * 1024`, podstawiona w pięciu
   wywołaniach `ParseMultipartForm`: `FileHandler.go:108`, `GameHandler.go:662`,
   `HandoutHandler.go:88`, `AvatarHandler.go:34`, `MusicHandler.go:156`. Argument tej funkcji to **maxMemory**
   — ile bajtów Go trzyma w RAM zanim zacznie zrzucać resztę do plików tymczasowych —
   a nie limit rozmiaru. Dziś `FileHandler.go:108` liczy `10 * storage.MaxFileSize`, co
   po podniesieniu stałej dałoby 150 MB w pamięci na jeden multi-upload. Rozmiar i tak
   jest sprawdzany osobno w `ValidateImageFile` (`FileHandler.go:57`).
3. Komunikat `"file too large: maximum size is 5MB"` w `local.go:67` i
   `FileHandler.go:58` ma zaszytą liczbę — idzie do formatowania ze stałej, żeby nie
   rozjechał się przy następnej zmianie.
4. Usunięcie `"image/gif"` z `local.go:37` (`AllowedImageTypes`), `local.go:45`
   (`AllowedHandoutTypes`), `FileHandler.go:51` (`AllowedFileImageTypes`),
   `HandoutHandler.go:26`. Poprawka komentarza Swaggera w `AvatarHandler.go:77`.
   Komunikaty o dozwolonych typach wymieniające GIF z nazwy — zaktualizowane.

## Zmiany w i18n

Nowe klucze: tytuł i przyciski `ImageCropModal`, sufiks `files.croppedSuffix`, tytuł
akcji kadrowania w `DraggableFileItem`, komunikat postępu przetwarzania w `FilesTab`,
komunikat o pliku źródłowym przekraczającym `MAX_SOURCE_BYTES` oraz komunikat
o nieudanym przetworzeniu obrazu (uszkodzony plik albo `toBlob` bez WebP przy źródle
z alfą).
Zaktualizowane klucze wymieniające GIF: `files.allowedFormats`,
`handouts.invalidFileType`, `characterSheet.invalidFileType`. Klucze po angielsku,
tłumaczenia równolegle w `locales/en` i `locales/pl`. Klucze osierocone po usunięciu
kadrownika z `GeneralTab` (`settings.gameImageCropTitle` i sąsiednie) — skasowane.

## Przypadki brzegowe

| Sytuacja | Zachowanie |
|---|---|
| Obraz poniżej `maxEdge`, bez kadrowania | Oryginał leci nietknięty, bez stratnej konwersji |
| Obraz poniżej `maxEdge`, z kadrowaniem | Przechodzi przez canvas, format z `pickEncoding`; nigdy nie powiększamy |
| Zdjęcie z telefonu z obrotem w EXIF | `imageOrientation: 'from-image'` prostuje przed rysowaniem |
| Wynik do 1 MP (avatar, kafelek gry, przycięty token) | Bezstratny PNG, bez ścieżki zapasowej |
| `toBlob` zwraca `null` dla WebP, źródło bez alfy (JPEG) | Ponowna próba z `image/jpeg` q0.85 |
| `toBlob` zwraca `null` dla WebP, źródło z alfą (PNG/WebP) | Błąd, plik pomijany — nigdy cicha utrata przezroczystości |
| Plik źródłowy ponad `MAX_SOURCE_BYTES` (80 MB) | Odrzucony przed dekodowaniem, z komunikatem; chroni kartę przeglądarki przed padem na 400 MB bitmapy |
| `createImageBitmap` rzuca (uszkodzony plik, brak pamięci) | Ten plik pomijany z komunikatem, reszta paczki leci dalej — `UploadFiles` już zbiera `errors[]` per plik |
| Anulowanie modala | `input.value = ''`, żeby ten sam plik dało się wybrać ponownie (wzorzec z `AvatarUpload.jsx:51`) |
| Plik nadal ponad limit po przetworzeniu | Serwer odrzuca, front pokazuje błąd; przy 4096 px i WebP praktycznie nieosiągalne |
| Próba wgrania GIF-a | Odrzucone przez `accept` w inpucie i przez walidację serwera |

## Testy

Canvas i `createImageBitmap` nie istnieją w jsdom, więc `processImage` w całości nie
jest sensownie testowalny bez ciężkich atrap. Dlatego logika decyzyjna wychodzi z niego
do czystych funkcji, które są testowane:

- `computeTargetSize(w, h, maxEdge)` — skalowanie dla orientacji poziomej i pionowej,
  brak powiększania, kwadrat, wymiar dokładnie równy limitowi;
- `shouldPassthrough(preset, cropArea, srcW, srcH)` — prawda dla obrazu poniżej limitu
  bez kadrowania, fałsz gdy podano `cropArea`, fałsz gdy obraz przekracza limit,
  prawda dla wymiarów dokładnie równych limitowi;
- `sourceMayHaveAlpha(file)` — prawda dla `image/png` i `image/webp`, fałsz dla
  `image/jpeg`; steruje tym, czy ścieżce zapasowej z D3 wolno zejść do JPEG;
- `pickEncoding(w, h)` — PNG dokładnie na progu `PNG_MAX_PIXELS`, WebP jeden piksel
  powyżej, oraz wynik dla wymiarów każdego z czterech presetów.

Reszta `processImage` to sekwencja wywołań API przeglądarki bez rozgałęzień —
testowanie jej sprowadzałoby się do testowania atrap. Backend nie dostaje nowej logiki,
więc bez nowych testów Go.
