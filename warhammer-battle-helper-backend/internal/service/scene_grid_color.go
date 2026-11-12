package service

import (
	"fmt"
	"regexp"
)

// gridColorPattern is the one shape <input type="color"> sends. Anything else is refused rather
// than normalized: the value is written into an inline style on every viewer's map.
var gridColorPattern = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

// validateGridColor accepts "" (reset to the default grid) or a "#rrggbb" colour.
func validateGridColor(color string) error {
	if color == "" || gridColorPattern.MatchString(color) {
		return nil
	}
	return fmt.Errorf("grid colour must be #rrggbb")
}
