package models

// GameThemes lists the theme ids the GM may pick. The backend stores and validates ids
// only; colours, fonts and ornaments live entirely in the frontend theme registry, so a
// new theme is one id here plus its CSS block there.
var GameThemes = []string{"default", "scifi", "twenties"}

// IsValidGameTheme reports whether id names a known theme. "" is not valid in a request:
// it is only the zero value of a game that never had a theme set (read as "default").
func IsValidGameTheme(id string) bool {
	for _, t := range GameThemes {
		if t == id {
			return true
		}
	}
	return false
}

// Appearance holds the per-game look chosen by the GM in GeneralTab. Like MapSettings it is
// shared session truth: every participant sees the same theme unless they opted out in
// their own UserSettings.IgnoreGameTheme.
type Appearance struct {
	Theme string `bson:"theme" json:"theme"` // "" = default
}

// UpdateAppearanceRequest is the PATCH /games/:id/appearance body.
type UpdateAppearanceRequest struct {
	Theme *string `json:"theme" binding:"required"`
}
