# FEATURE-131 — wieloliniowe wiadomości na czacie: plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gracz może wysłać na czat wiadomość wieloliniową (Shift+Enter = nowa linia, Enter = wyślij), a log ją poprawnie wyświetla.

**Architecture:** Pole czatu wyprowadzone z `DiceRollControls` do własnego komponentu `ChatInput` (własny CSS, własne testy), osadzonego jako rodzeństwo kontrolek kości w `RightPanel`. Backend dostaje czystą funkcję `NormalizeChatMessage` w osobnym module serwisowym, wołaną z `AddLogMessage`.

**Tech Stack:** React 18 + react-i18next + CRA/Jest/RTL (front), Go + Gin + MongoDB (backend).

**Spec:** `docs/superpowers/specs/2026-09-01-FEATURE-131-multiline-chat-design.md`

## Global Constraints

- Limit wiadomości: **500 znaków**, liczonych w **runach** (`utf8.RuneCountInString`), nie bajtach.
- Licznik we froncie pojawia się od **450** znaków.
- Maksymalna wysokość pola: **120 px**, potem scroll wewnątrz textarea.
- **Enter** wysyła, **Shift+Enter** wstawia nową linię.
- Trzy i więcej `\n` z rzędu zwijane do dwóch; `\r\n` → `\n`; całość trimowana.
- Wszystkie stringi UI przez `t('klucz')` — klucze angielskie, tłumaczenia równolegle w `locales/en/translation.json` i `locales/pl/translation.json`.
- Kod i komentarze w plikach źródłowych: **angielski** (konwencja repo — `token_masking.go`, `FogLayer.jsx`), łącznie z nazwami przypadków testowych. Proza planu i teksty UI to osobna sprawa.
- Ikony wyłącznie z `@mui/icons-material` (w tym feature nie dochodzą żadne nowe).
- Kod usuwany od razu, nie oznaczany jako martwy: stare style, stare klucze i18n, stary prop.
- Testy frontu: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=<nazwa>`. Znany baseline fail `App.test.js` (axios ESM) — nie jest regresją.
- Testy backendu: `cd warhammer-battle-helper-backend && go test ./internal/service/ -run <Nazwa> -v`.

---

### Task 1: Backend — moduł normalizacji wiadomości

Czysta funkcja bez zależności od bazy i grania — jak `scene_image_bounds.go` i `token_masking.go`.

**Files:**
- Create: `warhammer-battle-helper-backend/internal/service/chat_message.go`
- Test: `warhammer-battle-helper-backend/internal/service/chat_message_test.go`

**Interfaces:**
- Consumes: nic.
- Produces: `service.MaxChatMessageLength` (`int` = 500), `service.ErrChatMessageEmpty`, `service.ErrChatMessageTooLong` (oba `error`), `service.NormalizeChatMessage(msg string) (string, error)`.

- [ ] **Step 1: Napisz failujący test**

Utwórz `internal/service/chat_message_test.go`:

```go
package service

import (
	"errors"
	"strings"
	"testing"
)

func TestNormalizeChatMessage(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    string
		wantErr error
	}{
		{"single line unchanged", "Atakuję gobliny", "Atakuję gobliny", nil},
		{"CRLF converted to LF", "linia1\r\nlinia2", "linia1\nlinia2", nil},
		{"five blank lines collapse to one gap", "a\n\n\n\n\n\nb", "a\n\nb", nil},
		{"single blank line kept", "a\n\nb", "a\n\nb", nil},
		{"surrounding whitespace trimmed", "  \n tekst \n  ", "tekst", nil},
		{"whitespace-only rejected", "   \n\n\t ", "", ErrChatMessageEmpty},
		{"empty string rejected", "", "", ErrChatMessageEmpty},
		{"500 ASCII characters pass", strings.Repeat("a", 500), strings.Repeat("a", 500), nil},
		{"501 ASCII characters rejected", strings.Repeat("a", 501), "", ErrChatMessageTooLong},
		{"500 Polish characters pass", strings.Repeat("ą", 500), strings.Repeat("ą", 500), nil},
		{"501 Polish characters rejected", strings.Repeat("ą", 501), "", ErrChatMessageTooLong},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := NormalizeChatMessage(tc.input)
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("error = %v, want %v", err, tc.wantErr)
			}
			if got != tc.want {
				t.Fatalf("got = %q, want %q", got, tc.want)
			}
		})
	}
}
```

Przypadek „500 znaków polskich" jest tu po to, żeby wyłapać `len()` zamiast `utf8.RuneCountInString` — `len("ą") == 2`, więc implementacja bajtowa odrzuciłaby wiadomość już przy 251 znakach.

- [ ] **Step 2: Uruchom test — musi nie przejść**

```bash
cd warhammer-battle-helper-backend && go test ./internal/service/ -run TestNormalizeChatMessage -v
```

Oczekiwane: błąd kompilacji `undefined: NormalizeChatMessage`.

- [ ] **Step 3: Napisz implementację**

Utwórz `internal/service/chat_message.go`:

```go
package service

import (
	"errors"
	"regexp"
	"strings"
	"unicode/utf8"
)

// MaxChatMessageLength caps a chat message, counted in runes.
// The frontend holds the same value in components/log/ChatInput.jsx (MAX_MESSAGE_LENGTH).
const MaxChatMessageLength = 500

var (
	ErrChatMessageEmpty   = errors.New("chat message is empty")
	ErrChatMessageTooLong = errors.New("chat message is too long")
)

// blankLineRe matches three or more consecutive newlines.
var blankLineRe = regexp.MustCompile(`\n{3,}`)

// NormalizeChatMessage cleans up a chat message and enforces its limits.
//
// Order matters: normalization runs BEFORE the length check, so the backend rejects exactly
// the messages the frontend counter shows as over the limit.
//
// Length is measured in runes, not bytes - Polish characters take 2 bytes each, so len()
// would cut messages off at roughly half the stated limit.
func NormalizeChatMessage(msg string) (string, error) {
	msg = strings.ReplaceAll(msg, "\r\n", "\n")
	msg = strings.TrimSpace(msg)
	msg = blankLineRe.ReplaceAllString(msg, "\n\n")

	if msg == "" {
		return "", ErrChatMessageEmpty
	}
	if utf8.RuneCountInString(msg) > MaxChatMessageLength {
		return "", ErrChatMessageTooLong
	}
	return msg, nil
}
```

- [ ] **Step 4: Uruchom test — musi przejść**

```bash
cd warhammer-battle-helper-backend && go test ./internal/service/ -run TestNormalizeChatMessage -v
```

Oczekiwane: `PASS`, wszystkie 11 podprzypadków `--- PASS`.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-backend/internal/service/chat_message.go warhammer-battle-helper-backend/internal/service/chat_message_test.go
git commit -m "feat(back): FEATURE-131 chat message normalization and length limit"
```

---

### Task 2: Backend — podłączenie normalizacji do wysyłki wiadomości

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/service/GameService.go:663` (`AddLogMessage`)
- Modify: `warhammer-battle-helper-backend/internal/http/GameHandler.go:443` (`SendMessage`)

**Interfaces:**
- Consumes: `NormalizeChatMessage`, `ErrChatMessageEmpty`, `ErrChatMessageTooLong` z Taska 1.
- Produces: `POST /games/:id/message` zwraca 400 dla pustej i za długiej wiadomości, 200 dla poprawnej.

- [ ] **Step 1: Znormalizuj wiadomość w serwisie**

W `internal/service/GameService.go`, w `AddLogMessage`, **na samym początku funkcji** — przed `s.gameRepo.GetByID`, żeby odrzucona wiadomość nie kosztowała zapytania do bazy:

```go
func (s *GameService) AddLogMessage(gameID string, message string, messageType string, userID primitive.ObjectID, username string, visibility string) error {
	message, err := NormalizeChatMessage(message)
	if err != nil {
		return err
	}

	game, err := s.gameRepo.GetByID(gameID)
	if err != nil {
		return fmt.Errorf("game not found: %w", err)
	}
	// ... rest unchanged
```

Obie linie zostają na `:=` — w każdej po lewej jest przynajmniej jedna nowa zmienna
(`err` w pierwszej, `game` w drugiej), więc kompilator jest zadowolony bez żadnych przeróbek.

- [ ] **Step 2: Zmapuj błędy na 400 w handlerze**

W `internal/http/GameHandler.go`, w `SendMessage`, zamień obsługę błędu z `AddLogMessage`:

```go
	err = h.GameService.AddLogMessage(gameID, req.Message, "info", userID, username, req.Visibility)
	if err != nil {
		if errors.Is(err, service.ErrChatMessageEmpty) || errors.Is(err, service.ErrChatMessageTooLong) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
```

Dodaj `"errors"` do importów pliku, jeśli go tam nie ma. Pakiet `service` jest już importowany —
sprawdź nagłówek pliku i dodaj tylko brakujące.

Reszta pliku używa porównań `switch err.Error() { case "..." }`. Tutaj świadomie idziemy w sentinel
errors z `errors.Is`: porównanie stringów łamie się przy każdej literówce w komunikacie i nie
wychodzi z tego żaden błąd kompilacji.

- [ ] **Step 3: Sprawdź, że backend się kompiluje i testy przechodzą**

```bash
cd warhammer-battle-helper-backend && go build ./... && go test ./internal/... 2>&1 | tail -20
```

Oczekiwane: build bez wyjścia, testy `ok` / `no test files`, zero `FAIL`.

- [ ] **Step 4: Commit**

```bash
git add warhammer-battle-helper-backend/internal/service/GameService.go warhammer-battle-helper-backend/internal/http/GameHandler.go
git commit -m "feat(back): FEATURE-131 validate chat message length on send"
```

---

### Task 3: Frontend — komponent `ChatInput`

Komponent powstaje kompletny, ale jeszcze nigdzie nie renderowany. Podpięcie i usunięcie starego
pola to Task 4 — dzięki temu ten task da się zrecenzować w oderwaniu od reszty.

**Files:**
- Create: `warhammer-battle-helper-front/src/components/log/ChatInput.jsx`
- Create: `warhammer-battle-helper-front/src/components/log/ChatInput.css`
- Test: `warhammer-battle-helper-front/src/components/log/ChatInput.test.jsx`
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json`
- Modify: `warhammer-battle-helper-front/src/locales/pl/translation.json`

**Interfaces:**
- Consumes: nic.
- Produces: `ChatInput` — default export, jedyny props `onSend: (text: string) => void`, wołany z treścią po `trim()`. Klasy CSS: `.chat-input`, `.chat-input__field-wrap`, `.chat-input__field`, `.chat-input__counter`, `.chat-input__counter--full`, `.chat-input__send`. Klucze i18n: `chat.placeholder`, `chat.send`, `chat.charCount`.

- [ ] **Step 1: Dodaj klucze i18n**

W `locales/en/translation.json`, jako nowy blok najwyższego poziomu **bezpośrednio przed** blokiem `"dice": {`:

```json
  "chat": {
    "placeholder": "Send a message... (Shift+Enter for a new line)",
    "send": "Send",
    "charCount": "{{current}}/{{max}}"
  },
```

W `locales/pl/translation.json`, w tym samym miejscu:

```json
  "chat": {
    "placeholder": "Wyślij wiadomość... (Shift+Enter — nowa linia)",
    "send": "Wyślij",
    "charCount": "{{current}}/{{max}}"
  },
```

Licznik używa `{{current}}`, a **nie** `{{count}}` — `count` to w i18next zmienna zarezerwowana na
liczbę mnogą, przez którą biblioteka zaczyna szukać kluczy `charCount_one` / `charCount_other` i nie
znajduje żadnego.

Stare klucze `dice.chatPlaceholder` i `dice.send` zostają jeszcze na miejscu — kasuje je Task 4,
razem z jedynym kodem, który ich używa.

- [ ] **Step 2: Napisz failujące testy**

Utwórz `components/log/ChatInput.test.jsx`:

```jsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import '../../i18n';
import ChatInput from './ChatInput';

const field = () => document.querySelector('.chat-input__field');
const counter = () => document.querySelector('.chat-input__counter');

describe('ChatInput', () => {
    it('sends the trimmed message on Enter and clears the field', () => {
        const onSend = jest.fn();
        render(<ChatInput onSend={onSend} />);

        fireEvent.change(field(), { target: { value: '  Atakuję gobliny  ' } });
        fireEvent.keyDown(field(), { key: 'Enter' });

        expect(onSend).toHaveBeenCalledWith('Atakuję gobliny');
        expect(field().value).toBe('');
    });

    it('does not send on Shift+Enter', () => {
        const onSend = jest.fn();
        render(<ChatInput onSend={onSend} />);

        fireEvent.change(field(), { target: { value: 'pierwsza linia' } });
        fireEvent.keyDown(field(), { key: 'Enter', shiftKey: true });

        expect(onSend).not.toHaveBeenCalled();
        expect(field().value).toBe('pierwsza linia');
    });

    it('sends a multiline message as typed', () => {
        const onSend = jest.fn();
        render(<ChatInput onSend={onSend} />);

        fireEvent.change(field(), { target: { value: 'linia1\nlinia2' } });
        fireEvent.keyDown(field(), { key: 'Enter' });

        expect(onSend).toHaveBeenCalledWith('linia1\nlinia2');
    });

    it('ignores Enter while an IME composition is active', () => {
        const onSend = jest.fn();
        render(<ChatInput onSend={onSend} />);

        fireEvent.change(field(), { target: { value: 'tekst' } });
        fireEvent.keyDown(field(), { key: 'Enter', isComposing: true });

        expect(onSend).not.toHaveBeenCalled();
    });

    it('caps input at 500 characters', () => {
        render(<ChatInput onSend={() => {}} />);
        expect(field().maxLength).toBe(500);
    });

    it('shows the counter only near the limit', () => {
        render(<ChatInput onSend={() => {}} />);

        fireEvent.change(field(), { target: { value: 'a'.repeat(10) } });
        expect(counter()).toBeNull();

        fireEvent.change(field(), { target: { value: 'a'.repeat(460) } });
        expect(counter().textContent).toBe('460/500');
    });

    it('does not send an empty or whitespace-only message', () => {
        const onSend = jest.fn();
        render(<ChatInput onSend={onSend} />);

        fireEvent.change(field(), { target: { value: '   ' } });
        fireEvent.keyDown(field(), { key: 'Enter' });

        expect(onSend).not.toHaveBeenCalled();
    });
});
```

Testy nie sprawdzają wysokości pola: w jsdom `scrollHeight` zwraca 0 (brak layoutu), więc auto-grow
ustawi `0px`. To nie psuje niczego w teście, ale nie da się na tym niczego zaasertować.

- [ ] **Step 3: Uruchom testy — muszą nie przejść**

```bash
cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=ChatInput
```

Oczekiwane: `Cannot find module './ChatInput'`.

- [ ] **Step 4: Napisz komponent**

Utwórz `components/log/ChatInput.jsx`:

```jsx
import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './ChatInput.css';

const MAX_MESSAGE_LENGTH = 500;
const COUNTER_THRESHOLD = 450;
const MAX_INPUT_HEIGHT = 120; // ~6 lines, then the textarea scrolls

const ChatInput = ({ onSend }) => {
    const { t } = useTranslation();
    const [message, setMessage] = useState('');
    const textareaRef = useRef(null);

    const resizeToContent = useCallback(() => {
        const el = textareaRef.current;
        if (!el) return;
        // The reset is mandatory: scrollHeight never drops below the element's current height,
        // so without it the field grows but never shrinks back after the text is cleared.
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
    }, []);

    const handleChange = (e) => {
        setMessage(e.target.value);
        resizeToContent();
    };

    const handleSend = () => {
        const trimmed = message.trim();
        if (!trimmed) return;
        onSend(trimmed);
        setMessage('');
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
    };

    const handleKeyDown = (e) => {
        // isComposing: an Enter that confirms an IME candidate must not send the message.
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            handleSend();
        }
    };

    const showCounter = message.length >= COUNTER_THRESHOLD;
    const isFull = message.length >= MAX_MESSAGE_LENGTH;

    return (
        <div className="chat-input">
            <div className="chat-input__field-wrap">
                <textarea
                    ref={textareaRef}
                    rows={1}
                    className="chat-input__field"
                    value={message}
                    maxLength={MAX_MESSAGE_LENGTH}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    placeholder={t('chat.placeholder')}
                />
                {showCounter && (
                    <span className={`chat-input__counter${isFull ? ' chat-input__counter--full' : ''}`}>
                        {t('chat.charCount', { current: message.length, max: MAX_MESSAGE_LENGTH })}
                    </span>
                )}
            </div>
            <button
                className="chat-input__send"
                onClick={handleSend}
                disabled={!message.trim()}
            >
                {t('chat.send')}
            </button>
        </div>
    );
};

export default ChatInput;
```

- [ ] **Step 5: Napisz CSS**

Utwórz `components/log/ChatInput.css`:

```css
/* ================== CHAT INPUT ================== */
/* The --log-* variables come from :root in components/LogWindow.css. */

.chat-input {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 0 16px 16px;
}

.chat-input__field-wrap {
  position: relative;
  display: flex;
  flex-grow: 1;
}

.chat-input__field {
  flex-grow: 1;
  border: 1px solid var(--log-brown-light);
  padding: 6px 12px;
  border-radius: 4px;
  background: transparent;
  color: var(--log-brown-text);
  font-family: var(--log-font-body);
  font-size: 0.95rem;
  line-height: 1.4;
  resize: none;
  overflow-y: auto;
  max-height: 120px;
}

.chat-input__field:hover,
.chat-input__field:focus {
  border-color: #a67c52;
  outline: none;
}

.chat-input__counter {
  position: absolute;
  right: 8px;
  bottom: -14px;
  font-size: 0.7rem;
  color: var(--log-brown-muted);
  pointer-events: none;
}

.chat-input__counter--full {
  color: var(--log-red-medium);
}

.chat-input__send {
  border: 1px solid var(--log-brown-light);
  color: var(--log-brown-dark);
  background: transparent;
  padding: 6px 12px;
  font-family: var(--log-font-display);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  border-radius: 4px;
}

.chat-input__send:hover {
  border-color: #a67c52;
  background: rgba(201, 151, 91, 0.1);
}

.chat-input__send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

- [ ] **Step 6: Uruchom testy — muszą przejść**

```bash
cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=ChatInput
```

Oczekiwane: `Tests: 7 passed`.

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-front/src/components/log/ChatInput.jsx warhammer-battle-helper-front/src/components/log/ChatInput.css warhammer-battle-helper-front/src/components/log/ChatInput.test.jsx warhammer-battle-helper-front/src/locales/en/translation.json warhammer-battle-helper-front/src/locales/pl/translation.json
git commit -m "feat(front): FEATURE-131 add multiline ChatInput component"
```

---

### Task 4: Frontend — podmiana starego pola na `ChatInput`

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/log/DiceRollControls.jsx` (usunięcie czatu: `:15`, `:21-32`, `:151-168`, prop w `:12`)
- Modify: `warhammer-battle-helper-front/src/components/log/DiceRollControls.smoke.test.jsx` (trzy rendery z `onSendMessage`)
- Modify: `warhammer-battle-helper-front/src/components/panels/RightPanel.jsx:289`
- Modify: `warhammer-battle-helper-front/src/components/LogWindow.css:443-446, 494-536`
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json`, `locales/pl/translation.json`

**Interfaces:**
- Consumes: `ChatInput` z Taska 3.
- Produces: `DiceRollControls` bez propsa `onSendMessage`.

- [ ] **Step 1: Usuń czat z `DiceRollControls.jsx`**

Trzy wycinki do usunięcia:

1. Z sygnatury — prop `onSendMessage`:
```jsx
const DiceRollControls = ({ onRoll, rollVisibility = 'all', onVisibilityChange, onlyMyRolls = false, onToggleOnlyMyRolls, diceList, participants = [], currentUserId = null }) => {
```
2. Stan i handlery — skasuj `const [chatMessage, setChatMessage] = useState('');`, całe `handleSendMessage` i całe `handleKeyPress`.
3. Cały blok renderujący czat, od `<div className="dice-controls__chat-row">` do zamykającego ten `div`.

`useState` zostaje w imporcie — używają go `isCustomPopupOpen`, `customCount`, `customSides`.

- [ ] **Step 2: Wyczyść testy smoke**

W `DiceRollControls.smoke.test.jsx` usuń `onSendMessage={() => {}}` z trzech wywołań `render(...)`.
Zostaje np. `render(<DiceRollControls onRoll={onRoll} />);`.

- [ ] **Step 3: Osadź `ChatInput` w `RightPanel.jsx`**

Dodaj import obok pozostałych importów komponentów:
```jsx
import ChatInput from '../log/ChatInput';
```

I zamień linię 289:
```jsx
          <DiceRollControls onRoll={rollDice} rollVisibility={rollVisibility} onVisibilityChange={onRollVisibilityChange} onlyMyRolls={onlyMyRolls} onToggleOnlyMyRolls={setOnlyMyRolls} diceList={gameState?.customSystemTemplate?.settings?.diceButtons} participants={gameState?.participants || []} currentUserId={userId} />
          <ChatInput onSend={sendMessage} />
```

`sendMessage` (`RightPanel.jsx:77`) zostaje bez zmian — dalej wysyła POST z `visibility`.

- [ ] **Step 4: Przenieś padding i usuń martwe style**

W `components/LogWindow.css`:

Zmień `.dice-controls`, żeby nie trzymało dolnego paddingu — ten należy teraz do `.chat-input`:
```css
.dice-controls {
  padding: 16px 16px 0;
  border-top: 2px solid var(--log-brown-accent);
}
```

Usuń w całości reguły `.dice-controls__chat-row`, `.dice-controls__chat-input`,
`.dice-controls__chat-input:hover, .dice-controls__chat-input:focus`,
`.dice-controls__send-button`, `.dice-controls__send-button:hover`,
`.dice-controls__send-button:disabled` (linie 494-536). Nie kopiuj ich — odpowiedniki są już
w `ChatInput.css`.

- [ ] **Step 5: Usuń martwe klucze i18n**

Z `locales/en/translation.json` i `locales/pl/translation.json`, z bloku `"dice"`, usuń wpisy
`"chatPlaceholder"` i `"send"`. Nic już ich nie używa — `chat.placeholder` i `chat.send` je zastąpiły.

- [ ] **Step 6: Sprawdź, że nic nie zostało**

```bash
cd warhammer-battle-helper-front/src && grep -rn "onSendMessage\|dice.chatPlaceholder\|dice.send\|dice-controls__chat\|dice-controls__send-button" .
```

Oczekiwane: brak wyników.

- [ ] **Step 7: Uruchom testy**

```bash
cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern="ChatInput|DiceRollControls"
```

Oczekiwane: wszystkie suity `PASS`.

- [ ] **Step 8: Commit**

```bash
git add warhammer-battle-helper-front/src/components/log/DiceRollControls.jsx warhammer-battle-helper-front/src/components/log/DiceRollControls.smoke.test.jsx warhammer-battle-helper-front/src/components/panels/RightPanel.jsx warhammer-battle-helper-front/src/components/LogWindow.css warhammer-battle-helper-front/src/locales/en/translation.json warhammer-battle-helper-front/src/locales/pl/translation.json
git commit -m "refactor(front): FEATURE-131 move chat input out of dice controls"
```

---

### Task 5: Frontend — render nowych linii w logu

Bez tego cała reszta jest niewidoczna: `\n` dociera do przeglądarki, ale HTML zwija białe znaki
i wiadomość wygląda jak jedna linia ze spacjami.

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/LogWindow.css:353-358`

**Interfaces:**
- Consumes: nic.
- Produces: nic (zmiana wyłącznie prezentacyjna).

- [ ] **Step 1: Dodaj zawijanie do stylu tekstu wiadomości**

```css
.log-simple-message__text {
  font-family: var(--log-font-body);
  font-size: 0.95rem;
  line-height: 1.5;
  color: var(--log-brown-text);
  white-space: pre-wrap;      /* newlines visible, long lines still wrap */
  overflow-wrap: anywhere;    /* a pasted space-less URL cannot widen the panel */
}
```

`pre-wrap`, a nie `pre`: `pre` wyłączyłoby zawijanie długich linii i dołożyło poziomy scroll do
wąskiego panelu.

- [ ] **Step 2: Weryfikacja w działającej aplikacji**

Uruchom stack i sprawdź ręcznie w sesji gry:

1. Wpisz w czacie `linia1`, Shift+Enter, `linia2`, Enter.
2. W logu widać dwie linie, nie `linia1 linia2`.
3. Pole wróciło do wysokości jednej linii po wysłaniu.
4. Wklej ~300 znaków bez spacji — panel nie rozszerza się w poziomie.
5. Wpisz 460 znaków — pojawia się licznik `460/500`; przy 500 zmienia kolor i dalsze znaki nie wchodzą.

- [ ] **Step 3: Uruchom pełną suitę frontu**

```bash
cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false 2>&1 | tail -20
```

Oczekiwane: jedyny fail to `App.test.js` (axios ESM) — znany baseline, nie regresja.

- [ ] **Step 4: Commit**

```bash
git add warhammer-battle-helper-front/src/components/LogWindow.css
git commit -m "feat(front): FEATURE-131 render newlines in chat log messages"
```
