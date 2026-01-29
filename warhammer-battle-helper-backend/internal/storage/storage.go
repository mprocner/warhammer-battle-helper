package storage

import (
	"io"
	"mime/multipart"
)

// StorageConfig holds configuration for storage backends
type StorageConfig struct {
	Type     string // "local" or "s3"
	BasePath string // For local: "./avatars", For S3: bucket name
	BaseURL  string // URL prefix for accessing files

	// S3 fields for future use
	S3Region   string
	S3Endpoint string
	S3Key      string
	S3Secret   string
}

// Storage interface for file operations
type Storage interface {
	// Upload saves a file and returns the URL path
	Upload(file multipart.File, filename string, contentType string) (string, error)

	// Delete removes a file by its filename
	Delete(filename string) error

	// Get returns a reader for the file content and its content type
	Get(filename string) (io.ReadCloser, string, error)

	// GetURL returns the URL for accessing a file
	GetURL(filename string) string
}
