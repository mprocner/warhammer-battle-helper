package storage

import (
	"io"
	"os"
	"path/filepath"
	"testing"
)

// writeTestFile creates filename inside dir with some placeholder content.
func writeTestFile(t *testing.T, dir, filename string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, filename), []byte("test-content"), 0644); err != nil {
		t.Fatalf("failed to write test file %s: %v", filename, err)
	}
}

// TestGet_GIFStillServesAsImage pins that an already-stored .gif keeps
// serving as image/gif even though image/gif is no longer an accepted
// upload type. This is the decoupling FEATURE-132 requires.
func TestGet_GIFStillServesAsImage(t *testing.T) {
	dir := t.TempDir()
	s, err := NewLocalStorage(dir, "http://example.com/files")
	if err != nil {
		t.Fatalf("NewLocalStorage failed: %v", err)
	}

	writeTestFile(t, dir, "legacy.gif")

	reader, contentType, err := s.Get("legacy.gif")
	if err != nil {
		t.Fatalf("Get failed: %v", err)
	}
	defer reader.Close()

	if contentType != "image/gif" {
		t.Errorf("expected content type image/gif, got %q", contentType)
	}

	if _, stillAllowed := AllowedImageTypes["image/gif"]; stillAllowed {
		t.Errorf("expected image/gif to be absent from AllowedImageTypes, but it is present")
	}
}

// TestGet_WavIsDeterministic ensures a stored .wav always serves as
// audio/wav, regardless of Go's randomised map iteration order. A single
// call would have passed against the old reverse-scan code roughly half
// the time, so this loops many times.
func TestGet_WavIsDeterministic(t *testing.T) {
	dir := t.TempDir()
	s, err := NewLocalStorage(dir, "http://example.com/files")
	if err != nil {
		t.Fatalf("NewLocalStorage failed: %v", err)
	}

	writeTestFile(t, dir, "track.wav")

	for i := 0; i < 20; i++ {
		reader, contentType, err := s.Get("track.wav")
		if err != nil {
			t.Fatalf("Get failed on iteration %d: %v", i, err)
		}
		reader.Close()

		if contentType != "audio/wav" {
			t.Fatalf("iteration %d: expected content type audio/wav, got %q", i, contentType)
		}
	}
}

// TestGet_JpegExtensionMapsToJpeg ensures the .jpeg (not .jpg) extension
// still resolves to image/jpeg, a special case the old code handled
// explicitly.
func TestGet_JpegExtensionMapsToJpeg(t *testing.T) {
	dir := t.TempDir()
	s, err := NewLocalStorage(dir, "http://example.com/files")
	if err != nil {
		t.Fatalf("NewLocalStorage failed: %v", err)
	}

	writeTestFile(t, dir, "photo.jpeg")

	reader, contentType, err := s.Get("photo.jpeg")
	if err != nil {
		t.Fatalf("Get failed: %v", err)
	}
	defer reader.Close()

	if contentType != "image/jpeg" {
		t.Errorf("expected content type image/jpeg, got %q", contentType)
	}
}

// TestGet_UnknownExtensionServesOctetStream ensures unrecognised
// extensions fall back to application/octet-stream.
func TestGet_UnknownExtensionServesOctetStream(t *testing.T) {
	dir := t.TempDir()
	s, err := NewLocalStorage(dir, "http://example.com/files")
	if err != nil {
		t.Fatalf("NewLocalStorage failed: %v", err)
	}

	writeTestFile(t, dir, "mystery.xyz")

	reader, contentType, err := s.Get("mystery.xyz")
	if err != nil {
		t.Fatalf("Get failed: %v", err)
	}
	defer reader.Close()

	if contentType != "application/octet-stream" {
		t.Errorf("expected content type application/octet-stream, got %q", contentType)
	}

	// Sanity: reader actually returns the file contents.
	data, err := io.ReadAll(reader)
	if err != nil {
		t.Fatalf("failed to read file contents: %v", err)
	}
	if string(data) != "test-content" {
		t.Errorf("unexpected file contents: %q", string(data))
	}
}
