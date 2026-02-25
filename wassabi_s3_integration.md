# Plan: Integracja Wasabi CDN

## Context

Obecnie wszystkie pliki (obrazy, awatary, muzykę, handouty) backend przechowuje **lokalnie na dysku** serwera. To działa, ale ma wady:
- Pliki zajmują miejsce na serwerze aplikacji
- Serwer musi obsługiwać każde żądanie GET (pobieranie pliku = bandwidth serwera)
- Muzyka (do 50MB) streamowana przez backend jest kosztowna

Wasabi to tani obiektowy storage zgodny z S3 (~$7/TB/miesiąc, bez opłat za transfer). Integracja pozwoli serwować pliki **bezpośrednio z CDN**, odciążając backend.

## Dobra wiadomość: Architektura jest już gotowa

`storage.go` już definiuje interfejs `Storage` z komentarzem `// S3 fields for future use`. Wystarczy doimplementować nową strukturę `WasabiStorage`.

Frontend też już to obsługuje — funkcja `getFileUrl()` w `FilesTab.jsx` i `SceneImage.jsx`:
```js
return fileUrl.startsWith('http') ? fileUrl : `${getApiUrl()}${fileUrl}`;
```
Jeśli `GetURL()` zwróci pełne `https://` URL, frontend automatycznie użyje CDN bezpośrednio. **Żadnych zmian we frontendzie.**

---

## Co trzeba zrobić

### 1. Dodaj zależność `minio-go`
```bash
go get github.com/minio/minio-go/v7
```
- Plik: `warhammer-battle-helper-backend/go.mod`
- minio-go to lekki klient S3-compatible, obsługiwany przez Wasabi oficjalnie

---

### 2. Stwórz `internal/storage/wasabi.go`

Implementacja interfejsu `Storage` używająca minio-go:

```go
type WasabiStorage struct {
    client   *minio.Client
    bucket   string
    baseURL  string  // np. "https://my-bucket.s3.eu-central-1.wasabisys.com"
}

// Upload → client.PutObject(ctx, bucket, filename, file, -1, options)
// Delete → client.RemoveObject(ctx, bucket, filename, options)
// Get    → client.GetObject(ctx, bucket, filename, options) → zwraca reader
// GetURL → return baseURL + "/" + filename
```

Konstruktor: `NewWasabiStorage(endpoint, bucket, accessKey, secretKey, baseURL)`.

---

### 3. Zaktualizuj `main.go` — wybór backendu przez env var

Dodaj logikę: jeśli `STORAGE_TYPE=wasabi`, użyj WasabiStorage; jeśli nie, zostań przy LocalStorage.

```go
storageType := os.Getenv("STORAGE_TYPE") // "local" lub "wasabi"

if storageType == "wasabi" {
    // odczytaj WASABI_ENDPOINT, WASABI_BUCKET, WASABI_ACCESS_KEY,
    // WASABI_SECRET_KEY, WASABI_BASE_URL
    // stwórz jeden WasabiStorage dla wszystkich plików (lub osobne buckety)
    avatarStorage = storage.NewWasabiStorage(...)
    userFilesStorage = storage.NewWasabiStorage(...)
    musicFilesStorage = storage.NewWasabiStorage(...)
} else {
    // istniejący kod z NewLocalStorage
}
```

Zmienne środowiskowe do dodania:
| Zmienna | Przykład |
|---------|---------|
| `STORAGE_TYPE` | `wasabi` |
| `WASABI_ENDPOINT` | `s3.eu-central-1.wasabisys.com` |
| `WASABI_BUCKET` | `warhammer-helper` |
| `WASABI_ACCESS_KEY` | `ABC123...` |
| `WASABI_SECRET_KEY` | `xyz...` |
| `WASABI_BASE_URL` | `https://warhammer-helper.s3.eu-central-1.wasabisys.com` |

---

### 4. Zoptymalizuj handlery GET — redirect zamiast proxy

Obecny handler `/user-files/:filename` pobiera plik przez `storage.Get()` i proxy'uje przez backend. Z CDN możemy zamiast tego zrobić redirect:

```go
// FileHandler.go - GetFile()
func (h *FileHandler) GetFile(c *gin.Context) {
    filename := filepath.Base(c.Param("filename"))

    // Jeśli storage to CDN — redirect do CDN URL
    if redirectURL := h.Storage.GetURL(filename); strings.HasPrefix(redirectURL, "http") {
        c.Redirect(302, redirectURL)
        return
    }

    // Fallback: lokalny serwing (stare zachowanie)
    // ...existing code...
}
```

To samo dla `AvatarHandler.GetAvatar`, `HandoutHandler.GetHandoutFile`, `MusicHandler.GetMusicFile`.

Efekt: **plik leci z Wasabi, nie przez serwer** — zero bandwidth na backendzie.

---

## Pliki do modyfikacji

| Plik | Zmiana |
|------|--------|
| `warhammer-battle-helper-backend/go.mod` | Dodaj `github.com/minio/minio-go/v7` |
| `internal/storage/wasabi.go` | NOWY — implementacja WasabiStorage |
| `cmd/warhammer-battle-helper/main.go` | Dodaj warunek STORAGE_TYPE |
| `internal/http/FileHandler.go` | `GetFile()` → redirect |
| `internal/http/AvatarHandler.go` | `GetAvatar()` → redirect |
| `internal/http/HandoutHandler.go` | `GetHandoutFile()` → redirect |
| `internal/http/MusicHandler.go` | `GetMusicFile()` → redirect |

**Frontend: brak zmian.** Istniejąca logika `getFileUrl()` obsługuje pełne URL automatycznie.

---

## Podejście: Presigned URLs (nowe konta Wasabi)

Nowe konta Wasabi (po marcu 2023) nie mogą robić bucketów publicznych. Używamy **presigned URLs** — czasowych podpisanych linków generowanych dynamicznie.

**Kluczowy design:** W MongoDB nadal przechowujemy tylko **nazwę pliku** (np. `/user-files/uuid.jpg`), nie pełny URL Wasabi. Podpisany URL generujemy dynamicznie przy każdym GET request:

```
Browser GET /user-files/uuid.jpg
  → Backend generuje presigned URL (ważny 1h)
  → 302 Redirect → https://bucket.s3.wasabisys.com/uuid.jpg?X-Amz-Signature=...
  → Browser pobiera plik bezpośrednio z Wasabi
```

**Zalety tego podejścia:**
- Baza danych nie wymaga żadnych zmian (ścieżki nadal jak `/user-files/uuid.jpg`)
- URL jest zawsze świeży (nie ma problemu z wygasaniem)
- Kontrola dostępu (tylko backend może generować linki)
- Muzykę (50MB) serwuje Wasabi, nie serwer — oszczędność bandwidth

**Zmiana w interfejsie Storage** — dodamy metodę do generowania podpisanego URL:
```go
type Storage interface {
    Upload(...)  (string, error)
    Delete(...)  error
    Get(...)     (io.ReadCloser, string, error)
    GetURL(...)  string
    GetSignedURL(filename string) (string, error) // NOWE — opcjonalne, nil dla local
}
```

Handlery GET sprawdzają czy storage wspiera podpisywanie i jeśli tak, robią redirect zamiast serwowania pliku.

---

## Weryfikacja

1. Uruchom backend z `STORAGE_TYPE=wasabi` i uzupełnionymi kluczami
2. Wgraj plik przez FilesTab → sprawdź czy plik pojawia się w Wasabi bucket
3. Przeciągnij plik na scenę → sprawdź czy URL obrazu zaczyna się od `https://wasabi...`
4. Usuń plik → sprawdź czy znika z bucketu i ze sceny (WS broadcast)
5. Streameuj muzykę → sprawdź czy audio ładuje się bezpośrednio z CDN

Bez `STORAGE_TYPE=wasabi` backend działa jak przed zmianą (backward compatible).
