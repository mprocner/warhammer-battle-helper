package service

import (
	"battle-helper/internal/models"
	"fmt"
	"math"
	"regexp"
	"strings"
	"unicode/utf8"
)

// Limits for text drawing paths. The client enforces the same ranges in its controls; these are
// the authority.
const (
	maxDrawingTextChars = 500
	maxDrawingTextLines = 20
	minDrawingFontSize  = 8
	maxDrawingFontSize  = 120
	defaultDrawingFont  = "sans"
)

// Font ids, not CSS families: the client maps each id to a loaded font, so a stored path can never
// name a font the client does not ship.
var drawingTextFonts = map[string]bool{"sans": true, "serif": true, "display": true, "gothic": true, "mono": true}

var drawingTextBackdrops = map[string]bool{"none": true, "outline": true, "box": true}

var hexColor = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

// normalizeRotation folds any angle into (-180, 180].
func normalizeRotation(deg float64) float64 {
	if math.IsNaN(deg) || math.IsInf(deg, 0) {
		return 0
	}
	r := math.Mod(deg, 360)
	if r <= -180 {
		r += 360
	} else if r > 180 {
		r -= 360
	}
	return r
}

// normalizeTextPath validates and canonicalizes the text fields of a tool=="text" path in place.
// It runs on the full, merged path (create and update alike), so both entry points share one rule.
func normalizeTextPath(p *models.DrawingPath) error {
	p.Text = strings.TrimSpace(p.Text)
	if p.Text == "" {
		return fmt.Errorf("text must not be empty")
	}
	if utf8.RuneCountInString(p.Text) > maxDrawingTextChars {
		return fmt.Errorf("text is longer than %d characters", maxDrawingTextChars)
	}
	if strings.Count(p.Text, "\n")+1 > maxDrawingTextLines {
		return fmt.Errorf("text has more than %d lines", maxDrawingTextLines)
	}
	if len(p.Points) != 1 {
		return fmt.Errorf("text path needs exactly one anchor point")
	}

	if p.FontFamily == "" {
		p.FontFamily = defaultDrawingFont
	}
	if !drawingTextFonts[p.FontFamily] {
		return fmt.Errorf("unknown font %q", p.FontFamily)
	}
	if p.TextBackdrop == "" {
		p.TextBackdrop = "none"
	}
	if !drawingTextBackdrops[p.TextBackdrop] {
		return fmt.Errorf("unknown text backdrop %q", p.TextBackdrop)
	}
	if p.BackdropColor != "" && !hexColor.MatchString(p.BackdropColor) {
		return fmt.Errorf("backdrop colour must be #rrggbb, got %q", p.BackdropColor)
	}

	p.FontSize = math.Max(minDrawingFontSize, math.Min(maxDrawingFontSize, p.FontSize))
	p.Rotation = normalizeRotation(p.Rotation)
	return nil
}

// applyDrawingPathUpdate merges the present fields of req over the stored path.
func applyDrawingPathUpdate(p models.DrawingPath, req models.UpdateDrawingPathRequest) models.DrawingPath {
	if req.Text != nil {
		p.Text = *req.Text
	}
	if req.Points != nil {
		p.Points = *req.Points
	}
	if req.Color != nil && *req.Color != "" {
		p.Color = *req.Color
	}
	if req.FontSize != nil {
		p.FontSize = *req.FontSize
	}
	if req.FontFamily != nil {
		p.FontFamily = *req.FontFamily
	}
	if req.Bold != nil {
		p.Bold = *req.Bold
	}
	if req.Italic != nil {
		p.Italic = *req.Italic
	}
	if req.Rotation != nil {
		p.Rotation = *req.Rotation
	}
	if req.TextBackdrop != nil {
		p.TextBackdrop = *req.TextBackdrop
	}
	// "" is a real value here (back to automatic), unlike Color.
	if req.BackdropColor != nil {
		p.BackdropColor = *req.BackdropColor
	}
	return p
}
