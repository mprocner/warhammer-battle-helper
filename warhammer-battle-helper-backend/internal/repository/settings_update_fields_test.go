package repository

import (
	"battle-helper/internal/models"
	"testing"
)

// PATCH /settings carries one field at a time — that is how the frontend saves preferences.
// The write must therefore touch only the keys that were sent: a whole-document $set on the
// `settings` subdocument wiped the neighbouring field.
func TestSettingsUpdateFields(t *testing.T) {
	scheme := "classic"
	opacity := 0.35

	t.Run("fogGmOpacity alone leaves sceneControlScheme untouched", func(t *testing.T) {
		fields := settingsUpdateFields(models.UpdateSettingsRequest{FogGmOpacity: &opacity})
		if len(fields) != 1 {
			t.Fatalf("expected exactly 1 field, got %d: %v", len(fields), fields)
		}
		if fields["settings.fogGmOpacity"] != 0.35 {
			t.Errorf("settings.fogGmOpacity = %v, want 0.35", fields["settings.fogGmOpacity"])
		}
		if _, ok := fields["settings.sceneControlScheme"]; ok {
			t.Error("settings.sceneControlScheme should be absent")
		}
	})

	t.Run("sceneControlScheme alone leaves fogGmOpacity untouched", func(t *testing.T) {
		fields := settingsUpdateFields(models.UpdateSettingsRequest{SceneControlScheme: &scheme})
		if len(fields) != 1 {
			t.Fatalf("expected exactly 1 field, got %d: %v", len(fields), fields)
		}
		if fields["settings.sceneControlScheme"] != "classic" {
			t.Errorf("settings.sceneControlScheme = %v, want classic", fields["settings.sceneControlScheme"])
		}
	})

	t.Run("both fields sent, both written", func(t *testing.T) {
		fields := settingsUpdateFields(models.UpdateSettingsRequest{
			SceneControlScheme: &scheme,
			FogGmOpacity:       &opacity,
		})
		if len(fields) != 2 {
			t.Fatalf("expected 2 fields, got %d: %v", len(fields), fields)
		}
	})

	t.Run("an empty request has nothing to write", func(t *testing.T) {
		fields := settingsUpdateFields(models.UpdateSettingsRequest{})
		if len(fields) != 0 {
			t.Fatalf("expected empty map, got %v", fields)
		}
	})
}
