package features

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
)

type SystemToggle struct {
	Disabled      bool     `json:"disabled"`
	AllowedEmails []string `json:"allowedEmails"`
}

type FeatureToggles struct {
	Systems map[string]SystemToggle `json:"systems"`
}

func Load(path string) FeatureToggles {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return FeatureToggles{Systems: map[string]SystemToggle{}}
		}
		panic(fmt.Sprintf("feature-toggles: failed to read %s: %v", path, err))
	}

	var ft FeatureToggles
	if err := json.Unmarshal(data, &ft); err != nil {
		panic(fmt.Sprintf("feature-toggles: invalid JSON in %s: %v", path, err))
	}
	if ft.Systems == nil {
		ft.Systems = map[string]SystemToggle{}
	}
	return ft
}

func (ft FeatureToggles) IsSystemAllowed(system, email string) bool {
	toggle, exists := ft.Systems[system]
	if !exists {
		return true
	}
	if toggle.Disabled {
		return false
	}
	if len(toggle.AllowedEmails) == 0 {
		return true
	}
	emailLower := strings.ToLower(email)
	for _, allowed := range toggle.AllowedEmails {
		if strings.ToLower(allowed) == emailLower {
			return true
		}
	}
	return false
}

func (ft FeatureToggles) AllowedSystemsFor(allSystems []string, email string) []string {
	out := make([]string, 0, len(allSystems))
	for _, s := range allSystems {
		if ft.IsSystemAllowed(s, email) {
			out = append(out, s)
		}
	}
	return out
}
