package storage

import (
	"fmt"
	"io"
	"mime/multipart"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
)

// LocalStorage implements Storage interface for local filesystem
type LocalStorage struct {
	basePath string
	baseURL  string
}

// NewLocalStorage creates a new LocalStorage instance
func NewLocalStorage(basePath, baseURL string) (*LocalStorage, error) {
	// Ensure the directory exists
	if err := os.MkdirAll(basePath, 0755); err != nil {
		return nil, fmt.Errorf("failed to create storage directory: %w", err)
	}

	return &LocalStorage{
		basePath: basePath,
		baseURL:  baseURL,
	}, nil
}

// AllowedImageTypes contains the allowed MIME types for avatar uploads
var AllowedImageTypes = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/gif":  ".gif",
	"image/webp": ".webp",
}

// MaxFileSize is the maximum allowed file size (5MB)
const MaxFileSize = 5 * 1024 * 1024

// ValidateFile checks if the file is a valid image and within size limits
func ValidateFile(file multipart.File, header *multipart.FileHeader) (string, error) {
	// Check file size
	if header.Size > MaxFileSize {
		return "", fmt.Errorf("file too large: maximum size is 5MB")
	}

	// Check content type
	contentType := header.Header.Get("Content-Type")
	ext, ok := AllowedImageTypes[contentType]
	if !ok {
		return "", fmt.Errorf("invalid file type: only JPEG, PNG, GIF, and WebP are allowed")
	}

	return ext, nil
}

// GenerateFilename creates a unique filename using UUID
func GenerateFilename(ext string) string {
	return uuid.New().String() + ext
}

// Upload saves a file to local storage and returns the URL path
func (s *LocalStorage) Upload(file multipart.File, filename string, contentType string) (string, error) {
	// Create the full file path
	filePath := filepath.Join(s.basePath, filename)

	// Create the destination file
	dst, err := os.Create(filePath)
	if err != nil {
		return "", fmt.Errorf("failed to create file: %w", err)
	}
	defer dst.Close()

	// Copy the file content
	if _, err := io.Copy(dst, file); err != nil {
		// Clean up on error
		os.Remove(filePath)
		return "", fmt.Errorf("failed to save file: %w", err)
	}

	return s.GetURL(filename), nil
}

// Delete removes a file from local storage
func (s *LocalStorage) Delete(filename string) error {
	filePath := filepath.Join(s.basePath, filename)

	// Check if file exists
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		return nil // File doesn't exist, nothing to delete
	}

	if err := os.Remove(filePath); err != nil {
		return fmt.Errorf("failed to delete file: %w", err)
	}

	return nil
}

// Get returns a reader for the file content and its content type
func (s *LocalStorage) Get(filename string) (io.ReadCloser, string, error) {
	// Sanitize filename to prevent path traversal
	filename = filepath.Base(filename)
	filePath := filepath.Join(s.basePath, filename)

	// Check if file exists
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		return nil, "", fmt.Errorf("file not found: %s", filename)
	}

	// Open the file
	file, err := os.Open(filePath)
	if err != nil {
		return nil, "", fmt.Errorf("failed to open file: %w", err)
	}

	// Determine content type from extension
	ext := strings.ToLower(filepath.Ext(filename))
	contentType := "application/octet-stream"
	for ct, e := range AllowedImageTypes {
		if e == ext || (ext == ".jpeg" && e == ".jpg") {
			contentType = ct
			break
		}
	}

	return file, contentType, nil
}

// GetURL returns the URL for accessing a file
func (s *LocalStorage) GetURL(filename string) string {
	return s.baseURL + "/" + filename
}
