# FEATURE-131 — wieloliniowe wiadomości na czacie

Data: 2026-09-01

## Problem

Pole czatu to `<input type="text">` (`components/log/DiceRollControls.jsx:152`). Enter wysyła
wiadomość, nowej linii wpisać się nie da. Nawet gdyby `\n` przeszedł, log i tak by go nie pokazał —
`SimpleMessage.jsx` renderuje tekst w zwykłym `<div>`, a HTML zwija białe znaki.

## Rozwiązanie

Zawsze widoczna, auto-rosnąca `<textarea>` w wydzielonym komponencie `ChatInput`:

- start wysokość jednej linii — wygląda jak dzisiejsze pole
- rośnie z treścią do 120 px (~6 linii), dalej scroll
- **Enter** wysyła, **Shift+Enter** wstawia nową linię
- limit **500 znaków**, licznik pojawia się od 450
- log renderuje pełną treść z zachowaniem `\n`, bez zwijania i „pokaż więcej"

### Odrzucone alternatywy

| Wariant | Dlaczego nie |
|---|---|
| Przycisk przełączający tryb wieloliniowy | Decyzja o dłuższej wypowiedzi zapada w połowie zdania, nie przed nią. Dodatkowy klik za każdym razem. |
| Shift+Enter zamienia `input` na `textarea` | `<input type="text">` ignoruje Shift+Enter — trzeba by przechwycić klawisz, zamontować textarea, przenieść tekst i odtworzyć pozycję kursora. Remount miga i gubi caret. Dużo kodu, żeby udawać textarea, którą i tak trzeba mieć. |
| Enter = nowa linia, Ctrl+Enter = wyślij | Bezpieczniejsze dla długich opisów RP, ale łamie odruch z każdego komunikatora. |
| Clamp długiej wiadomości + „pokaż więcej" | Zbędne przy limicie 500 znaków. |
| CSS `field-sizing: content` zamiast JS | Brak wsparcia w Safari — pole zostałoby jednolinijkowe u części graczy. |
| Osobny `ChatService` w backendzie | Wiadomość to `GameEvent` osadzony w dokumencie gry. Nowy serwis dostałby to samo repozytorium i grę, a wniósłby wyłącznie warstwę przekazywania. |

## Architektura

### Nowy moduł — `ChatInput`

`components/log/ChatInput.jsx` — jedyny props: `onSend(text)`. Trzyma własny stan `chatMessage`,
`useRef` na textarea, auto-grow, obsługę klawiatury, licznik i przycisk „Wyślij".

`components/log/ChatInput.css` — blok BEM `.chat-input__*`, importowany wyłącznie przez
`ChatInput.jsx`. Zgodne z konwencją repo (CSS obok komponentu: `ScenesTab.css`,
`PlayerSettingsPopup.css`).

Osadzenie jako rodzeństwo `DiceRollControls` w `RightPanel.jsx`:

```jsx
<DiceRollControls onRoll={rollDice} ... />   {/* onSendMessage znika z propsów */}
<ChatInput onSend={sendMessage} />
```

Kontrolki kości przestają wiedzieć o czacie. `sendMessage` (`RightPanel.jsx:77`) bez zmian.

### Klawiatura i auto-grow

```jsx
const MAX_MESSAGE_LENGTH = 500;
const COUNTER_THRESHOLD = 450;
const MAX_INPUT_HEIGHT = 120;

const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        handleSend();
    }
};

const autoGrow = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';                                   // najpierw skurcz
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
};
```

`height = 'auto'` przed odczytem `scrollHeight` jest obowiązkowe: `scrollHeight` nie zmaleje poniżej
aktualnej wysokości elementu, więc bez resetu pole urośnie i już nigdy się nie skurczy po skasowaniu
tekstu.

`onKeyPress` znika — jest deprecated. `isComposing` chroni użytkowników IME: Enter zatwierdzający
kandydata znaku nie może wysłać wiadomości.

Po wysłaniu: czyścimy stan i resetujemy `style.height` do wartości wyjściowej.

### Style pola

```css
.chat-input { display: flex; gap: 8px; align-items: flex-end; padding: 0 16px 16px; }
.chat-input__field { resize: none; overflow-y: auto; max-height: 120px; line-height: 1.4; }
```

`align-items: flex-end` trzyma przycisk „Wyślij" przy dolnej krawędzi rosnącego pola.
`.dice-controls` traci dolny padding — dziś jego `padding: 16px` obejmuje także wiersz czatu.

Reguły `.dice-controls__chat-row`, `.dice-controls__chat-input`, `.dice-controls__send-button`
zostają **usunięte** z `LogWindow.css` (825 linii), nie skopiowane.

### Render wiadomości

```css
.log-simple-message__text {
  white-space: pre-wrap;      /* \n widoczne, zwijanie długich linii zachowane */
  overflow-wrap: anywhere;    /* wklejony URL bez spacji nie rozepcha panelu */
}
```

Zostaje w `LogWindow.css` — to render logu, nie pole wprowadzania.

### Limity — backend

Nowy `internal/service/chat_message.go` (wzorzec `token_masking.go`, `scene_image_bounds.go`):

```go
const MaxChatMessageLength = 500

func NormalizeChatMessage(msg string) (string, error) {
    msg = strings.ReplaceAll(msg, "\r\n", "\n")
    msg = strings.TrimSpace(msg)
    msg = blankLineRe.ReplaceAllString(msg, "\n\n")   // 3+ \n -> 2
    if msg == "" {
        return "", ErrChatMessageEmpty
    }
    if utf8.RuneCountInString(msg) > MaxChatMessageLength {
        return "", ErrChatMessageTooLong
    }
    return msg, nil
}
```

`utf8.RuneCountInString`, nie `len()` — polskie znaki zajmują po 2 bajty, `len()` odcinałby
wiadomości mniej więcej w połowie deklarowanego limitu.

Normalizacja **przed** pomiarem długości, żeby limit odrzucał dokładnie to, co licznik we froncie
pokazuje jako przekroczone.

`GameService.AddLogMessage` (`GameService.go:663`) woła normalizację przed zbudowaniem
`GameEvent`. `GameHandler.SendMessage` (`GameHandler.go:443`) mapuje `ErrChatMessageEmpty` i
`ErrChatMessageTooLong` na 400.

Front broni się `maxLength={500}` i licznikiem; backend waliduje niezależnie — te same dwie warstwy
co przy innych polach.

### i18n

Nowe klucze w `en` i `pl`: `chat.placeholder`, `chat.send`, `chat.charCount`.
Usunięte: `dice.chatPlaceholder`, `dice.send`.

## Testy

`components/log/ChatInput.test.jsx` (nowy, `import '../../i18n';` jak reszta testów renderujących):

- Enter wysyła treść przez `onSend` i czyści pole
- Shift+Enter **nie** wywołuje `onSend`
- textarea ma `maxLength` 500
- licznik ukryty przy 10 znakach, widoczny przy 460

W jsdom `scrollHeight` zwraca 0 (brak layoutu), więc testy sprawdzają zachowanie, nie wysokość.
Auto-grow ustawi `0px` i nic to nie psuje.

`DiceRollControls.smoke.test.jsx` — usunięcie `onSendMessage={() => {}}` z trzech renderów.

`internal/service/chat_message_test.go` — tabelka: CRLF, pięć pustych linii z rzędu, sam
whitespace, 500 vs 501 znaków ASCII, 500 znaków polskich.

## Pliki

| Plik | Zmiana |
|---|---|
| `components/log/ChatInput.jsx` | nowy |
| `components/log/ChatInput.css` | nowy |
| `components/log/ChatInput.test.jsx` | nowy |
| `components/log/DiceRollControls.jsx` | usunięty czat i prop `onSendMessage` |
| `components/log/DiceRollControls.smoke.test.jsx` | usunięty nieużywany prop |
| `components/panels/RightPanel.jsx` | render `ChatInput` |
| `components/LogWindow.css` | usunięte style czatu, `pre-wrap` na tekście wiadomości, padding `.dice-controls` |
| `locales/en/translation.json`, `locales/pl/translation.json` | klucze `chat.*`, usunięte `dice.chatPlaceholder` i `dice.send` |
| `internal/service/chat_message.go` | nowy |
| `internal/service/chat_message_test.go` | nowy |
| `internal/service/GameService.go` | `AddLogMessage` normalizuje |
| `internal/http/GameHandler.go` | błędy walidacji na 400 |
