package models

import "slices"

// Template member roles (PLAYRPG-279). Every template has at least one owner.
const (
	RoleViewer = "viewer"
	RoleEditor = "editor"
	RoleOwner  = "owner"
)

// TemplateAction is one thing a user may do with a template.
type TemplateAction string

const (
	ActionUse    TemplateAction = "use"    // see it, create a game from it, clone it
	ActionEdit   TemplateAction = "edit"   // save name, sections, settings
	ActionShare  TemplateAction = "share"  // manage members and isPublic
	ActionDelete TemplateAction = "delete" // delete the template
)

// rolePermissions is the single source of truth for what a role may do. The Go predicate
// (service.CanOnTemplate) and the Mongo write filters (repository, through RolesWith) both read
// it, so they cannot drift apart. Adding a role is one row here plus its label in the client.
var rolePermissions = map[string][]TemplateAction{
	RoleViewer: {ActionUse},
	RoleEditor: {ActionUse, ActionEdit},
	RoleOwner:  {ActionUse, ActionEdit, ActionShare, ActionDelete},
}

// IsValidRole reports whether role is one of the known member roles.
func IsValidRole(role string) bool {
	_, ok := rolePermissions[role]
	return ok
}

// RoleCan reports whether role grants a. An unknown or empty role grants nothing.
func RoleCan(role string, a TemplateAction) bool {
	return slices.Contains(rolePermissions[role], a)
}

// RolesWith lists the roles granting a, sorted so the filters built from it are deterministic.
func RolesWith(a TemplateAction) []string {
	var roles []string
	for role, actions := range rolePermissions {
		if slices.Contains(actions, a) {
			roles = append(roles, role)
		}
	}
	slices.Sort(roles)
	return roles
}
