package models

import (
	"slices"
	"testing"
)

func TestRoleCan(t *testing.T) {
	cases := []struct {
		role   string
		action TemplateAction
		want   bool
	}{
		{RoleViewer, ActionUse, true},
		{RoleViewer, ActionEdit, false},
		{RoleViewer, ActionShare, false},
		{RoleViewer, ActionDelete, false},
		{RoleEditor, ActionUse, true},
		{RoleEditor, ActionEdit, true},
		{RoleEditor, ActionShare, false},
		{RoleEditor, ActionDelete, false},
		{RoleOwner, ActionUse, true},
		{RoleOwner, ActionEdit, true},
		{RoleOwner, ActionShare, true},
		{RoleOwner, ActionDelete, true},
		{"", ActionUse, false},
		{"admin", ActionUse, false},
	}
	for _, c := range cases {
		if got := RoleCan(c.role, c.action); got != c.want {
			t.Errorf("RoleCan(%q, %q) = %v, want %v", c.role, c.action, got, c.want)
		}
	}
}

func TestRolesWith(t *testing.T) {
	cases := map[TemplateAction][]string{
		ActionUse:    {RoleEditor, RoleOwner, RoleViewer},
		ActionEdit:   {RoleEditor, RoleOwner},
		ActionShare:  {RoleOwner},
		ActionDelete: {RoleOwner},
	}
	for action, want := range cases {
		if got := RolesWith(action); !slices.Equal(got, want) {
			t.Errorf("RolesWith(%q) = %v, want %v", action, got, want)
		}
	}
}

func TestIsValidRole(t *testing.T) {
	for _, r := range []string{RoleViewer, RoleEditor, RoleOwner} {
		if !IsValidRole(r) {
			t.Errorf("IsValidRole(%q) = false, want true", r)
		}
	}
	for _, r := range []string{"", "Owner", "admin"} {
		if IsValidRole(r) {
			t.Errorf("IsValidRole(%q) = true, want false", r)
		}
	}
}
