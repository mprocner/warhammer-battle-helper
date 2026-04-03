package storage

import (
	"bytes"
	"encoding/binary"
	"io"
)

// ExtractDuration returns the duration in seconds of an audio file.
// Supports audio/mpeg (MP3) and audio/wav. Returns 0 on error or unsupported format.
func ExtractDuration(r io.Reader, mimeType string, fileSize int64) float64 {
	switch mimeType {
	case "audio/mpeg":
		return extractMP3Duration(r, fileSize)
	case "audio/wav", "audio/x-wav":
		return extractWAVDuration(r)
	}
	return 0
}

// extractWAVDuration parses a WAV RIFF file to compute duration.
func extractWAVDuration(r io.Reader) float64 {
	// Read 12-byte RIFF header
	header := make([]byte, 12)
	if _, err := io.ReadFull(r, header); err != nil {
		return 0
	}
	if string(header[0:4]) != "RIFF" || string(header[8:12]) != "WAVE" {
		return 0
	}

	var byteRate uint32

	// Scan chunks to find "fmt " and "data"
	chunkHeader := make([]byte, 8)
	for {
		if _, err := io.ReadFull(r, chunkHeader); err != nil {
			break
		}
		chunkID := string(chunkHeader[0:4])
		chunkSize := binary.LittleEndian.Uint32(chunkHeader[4:8])

		switch chunkID {
		case "fmt ":
			fmtData := make([]byte, chunkSize)
			if _, err := io.ReadFull(r, fmtData); err != nil {
				return 0
			}
			if len(fmtData) >= 12 {
				byteRate = binary.LittleEndian.Uint32(fmtData[8:12])
			}
			// Pad to even size
			if chunkSize%2 != 0 {
				io.ReadFull(r, make([]byte, 1)) //nolint:errcheck
			}
		case "data":
			if byteRate == 0 {
				return 0
			}
			return float64(chunkSize) / float64(byteRate)
		default:
			// Skip unknown chunk (pad to even)
			skip := int(chunkSize)
			if chunkSize%2 != 0 {
				skip++
			}
			io.ReadFull(r, make([]byte, skip)) //nolint:errcheck
		}
	}
	return 0
}

// mp3BitratesV1L3 is the bitrate table (kbps) for MPEG1 Layer III.
var mp3BitratesV1L3 = [16]int{0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0}

// mp3BitratesV2L3 is the bitrate table (kbps) for MPEG2/2.5 Layer III.
var mp3BitratesV2L3 = [16]int{0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0}

// mp3SampleRatesV1 is the sample rate table (Hz) for MPEG1.
var mp3SampleRatesV1 = [4]int{44100, 48000, 32000, 0}

// mp3SampleRatesV2 is the sample rate table (Hz) for MPEG2.
var mp3SampleRatesV2 = [4]int{22050, 24000, 16000, 0}

// mp3SampleRatesV25 is the sample rate table (Hz) for MPEG2.5.
var mp3SampleRatesV25 = [4]int{11025, 12000, 8000, 0}

// extractMP3Duration estimates the duration of an MP3 file.
// Reads up to 128KB to find the first MPEG frame and optional Xing/Info VBR header.
func extractMP3Duration(r io.Reader, fileSize int64) float64 {
	const bufSize = 128 * 1024
	buf := make([]byte, bufSize)
	n, _ := io.ReadFull(r, buf)
	if n < 10 {
		return 0
	}
	buf = buf[:n]

	pos := 0
	id3Size := int64(0)

	// Skip ID3v2 tag (starts with "ID3")
	if buf[0] == 'I' && buf[1] == 'D' && buf[2] == '3' && len(buf) >= 10 {
		// Size is encoded as four 7-bit bytes (syncsafe integer)
		sz := int64(buf[6]&0x7F)<<21 |
			int64(buf[7]&0x7F)<<14 |
			int64(buf[8]&0x7F)<<7 |
			int64(buf[9]&0x7F)
		id3Size = sz + 10
		// Also check for ID3v2 footer flag (bit 4 of flags byte = buf[5])
		if buf[5]&0x10 != 0 {
			id3Size += 10
		}
		if int(id3Size) >= len(buf) {
			// ID3 tag doesn't fit in our buffer — fall back to 0 (file too large)
			return 0
		}
		pos = int(id3Size)
	}

	// Find first MPEG sync word: 0xFF followed by 0xE0 or higher
	syncPos := -1
	for i := pos; i < len(buf)-3; i++ {
		if buf[i] == 0xFF && (buf[i+1]&0xE0) == 0xE0 {
			syncPos = i
			break
		}
	}
	if syncPos < 0 {
		return 0
	}

	// Parse 4-byte MPEG frame header
	h1 := buf[syncPos+1]
	h2 := buf[syncPos+2]
	h3 := buf[syncPos+3]

	versionBits := (h1 >> 3) & 0x03 // 3=MPEG1, 2=MPEG2, 0=MPEG2.5
	layerBits := (h1 >> 1) & 0x03   // 1=L3, 2=L2, 3=L1
	bitrateIdx := (h2 >> 4) & 0x0F
	srIdx := (h2 >> 2) & 0x03
	channelMode := (h3 >> 6) & 0x03 // 3=mono

	if layerBits != 1 {
		// Only support Layer III
		return 0
	}

	var bitrate, sampleRate, samplesPerFrame int

	switch versionBits {
	case 3: // MPEG1
		bitrate = mp3BitratesV1L3[bitrateIdx] * 1000
		sampleRate = mp3SampleRatesV1[srIdx]
		samplesPerFrame = 1152
	case 2: // MPEG2
		bitrate = mp3BitratesV2L3[bitrateIdx] * 1000
		sampleRate = mp3SampleRatesV2[srIdx]
		samplesPerFrame = 576
	case 0: // MPEG2.5
		bitrate = mp3BitratesV2L3[bitrateIdx] * 1000
		sampleRate = mp3SampleRatesV25[srIdx]
		samplesPerFrame = 576
	default:
		return 0
	}

	if bitrate == 0 || sampleRate == 0 {
		return 0
	}

	// Check for Xing/Info VBR header in side information
	// Offset from frame start: 4 (header) + side info size
	var sideInfoSize int
	if versionBits == 3 { // MPEG1
		if channelMode == 3 { // mono
			sideInfoSize = 17
		} else {
			sideInfoSize = 32
		}
	} else { // MPEG2/2.5
		if channelMode == 3 {
			sideInfoSize = 9
		} else {
			sideInfoSize = 17
		}
	}

	xingOffset := syncPos + 4 + sideInfoSize
	if xingOffset+12 <= len(buf) {
		tag := string(buf[xingOffset : xingOffset+4])
		if tag == "Xing" || tag == "Info" {
			flags := binary.BigEndian.Uint32(buf[xingOffset+4 : xingOffset+8])
			if flags&0x01 != 0 { // total frames field present
				totalFrames := binary.BigEndian.Uint32(buf[xingOffset+8 : xingOffset+12])
				if totalFrames > 0 {
					return float64(totalFrames) * float64(samplesPerFrame) / float64(sampleRate)
				}
			}
		}
	}

	// VBRI header (Fraunhofer VBR) — at fixed offset 36 from frame start
	vbriOffset := syncPos + 36
	if vbriOffset+14 <= len(buf) && bytes.Equal(buf[vbriOffset:vbriOffset+4], []byte("VBRI")) {
		totalFrames := binary.BigEndian.Uint32(buf[vbriOffset+14 : vbriOffset+18])
		if vbriOffset+18 <= len(buf) && totalFrames > 0 {
			return float64(totalFrames) * float64(samplesPerFrame) / float64(sampleRate)
		}
	}

	// CBR fallback: estimate from file size and bitrate
	audioSize := fileSize - id3Size
	if audioSize <= 0 {
		return 0
	}
	return float64(audioSize) * 8.0 / float64(bitrate)
}
