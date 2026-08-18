package service

import (
	"battle-helper/internal/models"
	"battle-helper/internal/repository"
	"battle-helper/internal/websocket"
	"fmt"
	"log"
	"sort"
	"time"

	"github.com/microcosm-cc/bluemonday"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

var noteHTMLPolicy = bluemonday.NewPolicy()

func init() {
	noteHTMLPolicy.AllowStandardAttributes()
	noteHTMLPolicy.AllowElements(
		"b", "i", "u", "strong", "em", "s",
		"p", "br", "hr",
		"ul", "ol", "li",
		"h1", "h2", "h3",
		"blockquote", "pre", "code",
	)
	noteHTMLPolicy.AllowAttrs("href", "target", "rel").OnElements("a")
}

type NoteService struct {
	noteRepo *repository.NoteRepository
	hub      *websocket.Hub
}

func NewNoteService(noteRepo *repository.NoteRepository, hub *websocket.Hub) *NoteService {
	return &NoteService{
		noteRepo: noteRepo,
		hub:      hub,
	}
}

// isParticipant checks whether a user is the GM or an active participant
func (s *NoteService) isParticipant(game *models.Game, userID primitive.ObjectID) bool {
	return CanAccessGame(game, userID)
}

// findNote finds a note by ID in the game's notes array
func (s *NoteService) findNote(game *models.Game, noteID primitive.ObjectID) *models.Note {
	for i := range game.Notes {
		if game.Notes[i].ID == noteID {
			return &game.Notes[i]
		}
	}
	return nil
}

// canAccessNote checks whether a user can view/edit/delete a note
// Private notes: only creator. Public notes: any participant.
func (s *NoteService) canAccessNote(note *models.Note, userID primitive.ObjectID) bool {
	if note.IsPrivate {
		return note.CreatorID == userID
	}
	return true // public notes accessible to any participant
}

// broadcastNote sends a WS event scoped by note privacy, excluding the sender
func (s *NoteService) broadcastNote(gameID, eventType string, payload map[string]interface{}, note *models.Note, excludeUserID string) {
	if note.IsPrivate {
		// Private note: only creator sees it. If sender IS the creator, no broadcast needed.
		if note.CreatorID.Hex() != excludeUserID {
			s.hub.BroadcastToUsers(gameID, eventType, payload, []string{note.CreatorID.Hex()})
		}
	} else {
		s.hub.BroadcastToGameExcept(gameID, eventType, payload, excludeUserID)
	}
}

// CreateNote creates a new note in the game
func (s *NoteService) CreateNote(gameID string, userID primitive.ObjectID, req models.CreateNoteRequest) (*models.Note, error) {
	game, err := s.noteRepo.GetGame(gameID)
	if err != nil {
		return nil, err
	}

	if !s.isParticipant(game, userID) {
		return nil, fmt.Errorf("user is not a participant of this game")
	}

	now := time.Now()
	note := models.Note{
		ID:        primitive.NewObjectID(),
		Title:     req.Title,
		Content:   noteHTMLPolicy.Sanitize(req.Content),
		IsPrivate: req.IsPrivate,
		CreatorID: userID,
		CreatedAt: now,
		UpdatedAt: now,
	}

	if err := s.noteRepo.AddNote(gameID, note); err != nil {
		return nil, err
	}

	// Prepend to creator's note order (non-fatal — note is already created)
	if orderErr := s.noteRepo.AddNoteToOrder(gameID, userID, note.ID.Hex()); orderErr != nil {
		log.Printf("warn: failed to add note %s to order for user %s: %v", note.ID.Hex(), userID.Hex(), orderErr)
	}

	payload := map[string]interface{}{"note": note}
	s.broadcastNote(gameID, websocket.EventNoteCreated, payload, &note, userID.Hex())

	return &note, nil
}

// GetNotes returns notes visible to the requesting user, sorted by their stored order.
// Notes not in the stored order appear at the end, sorted by createdAt descending.
func (s *NoteService) GetNotes(gameID string, userID primitive.ObjectID) ([]models.Note, error) {
	game, err := s.noteRepo.GetGame(gameID)
	if err != nil {
		return nil, err
	}

	if !s.isParticipant(game, userID) {
		return nil, fmt.Errorf("user is not a participant of this game")
	}

	visible := make([]models.Note, 0)
	for _, note := range game.Notes {
		if !note.IsPrivate || note.CreatorID == userID {
			visible = append(visible, note)
		}
	}

	// Find this user's stored note order
	var noteOrder []string
	for _, p := range game.Participants {
		if p.UserID == userID {
			noteOrder = p.NoteOrder
			break
		}
	}

	if len(noteOrder) == 0 {
		// No stored order: fallback to createdAt descending (legacy behavior)
		sort.Slice(visible, func(i, j int) bool {
			return visible[i].CreatedAt.After(visible[j].CreatedAt)
		})
		return visible, nil
	}

	// Build lookup map for O(1) access
	noteMap := make(map[string]models.Note, len(visible))
	for _, n := range visible {
		noteMap[n.ID.Hex()] = n
	}

	// Apply stored order; skip IDs no longer in visible (deleted = lazy cleanup)
	ordered := make([]models.Note, 0, len(visible))
	seen := make(map[string]bool, len(visible))
	for _, id := range noteOrder {
		if n, ok := noteMap[id]; ok {
			ordered = append(ordered, n)
			seen[id] = true
		}
	}

	// Append notes not yet in stored order (created after last reorder, or by others)
	unseen := make([]models.Note, 0)
	for _, n := range visible {
		if !seen[n.ID.Hex()] {
			unseen = append(unseen, n)
		}
	}
	sort.Slice(unseen, func(i, j int) bool {
		return unseen[i].CreatedAt.After(unseen[j].CreatedAt)
	})
	ordered = append(ordered, unseen...)

	return ordered, nil
}

// ReorderNotes persists the user's preferred note order
func (s *NoteService) ReorderNotes(gameID string, userID primitive.ObjectID, noteIDs []string) error {
	game, err := s.noteRepo.GetGame(gameID)
	if err != nil {
		return err
	}

	if !s.isParticipant(game, userID) {
		return fmt.Errorf("user is not a participant of this game")
	}

	// Build set of visible note IDs for lenient validation
	visible := make(map[string]bool)
	for _, note := range game.Notes {
		if !note.IsPrivate || note.CreatorID == userID {
			visible[note.ID.Hex()] = true
		}
	}

	// Filter out IDs that no longer exist (lenient: skip stale IDs, don't reject)
	filtered := make([]string, 0, len(noteIDs))
	for _, id := range noteIDs {
		if visible[id] {
			filtered = append(filtered, id)
		}
	}

	return s.noteRepo.SaveNoteOrder(gameID, userID, filtered)
	// No WS broadcast — per-user preference, other clients are unaffected
}

// UpdateNote updates a note's fields
func (s *NoteService) UpdateNote(gameID string, noteID primitive.ObjectID, userID primitive.ObjectID, req models.UpdateNoteRequest) (*models.Note, error) {
	game, err := s.noteRepo.GetGame(gameID)
	if err != nil {
		return nil, err
	}

	if !s.isParticipant(game, userID) {
		return nil, fmt.Errorf("user is not a participant of this game")
	}

	existing := s.findNote(game, noteID)
	if existing == nil {
		return nil, fmt.Errorf("note not found")
	}

	if !s.canAccessNote(existing, userID) {
		return nil, fmt.Errorf("permission denied")
	}

	// Track visibility transition
	wasPrivate := existing.IsPrivate

	// Build update fields
	now := time.Now()
	fields := bson.M{"updatedAt": now}
	existing.UpdatedAt = now // keep in sync for broadcast
	if req.Title != nil {
		fields["title"] = *req.Title
		existing.Title = *req.Title
	}
	if req.Content != nil {
		sanitized := noteHTMLPolicy.Sanitize(*req.Content)
		fields["content"] = sanitized
		existing.Content = sanitized
	}
	if req.IsPrivate != nil {
		fields["isPrivate"] = *req.IsPrivate
		existing.IsPrivate = *req.IsPrivate
	}

	if err := s.noteRepo.UpdateNote(gameID, noteID, fields); err != nil {
		return nil, err
	}

	// Handle visibility transitions in broadcasts
	willBePrivate := existing.IsPrivate
	payload := map[string]interface{}{"note": existing}

	senderID := userID.Hex()
	switch {
	case !wasPrivate && willBePrivate:
		// Public → Private: delete from everyone's view (except sender), then no echo to sender
		s.hub.BroadcastToGameExcept(gameID, websocket.EventNoteDeleted, map[string]interface{}{
			"noteId": noteID.Hex(),
		}, senderID)
	case wasPrivate && !willBePrivate:
		// Private → Public: appears as a new note for everyone except sender
		s.hub.BroadcastToGameExcept(gameID, websocket.EventNoteCreated, payload, senderID)
	default:
		// No visibility change — broadcast to others
		s.broadcastNote(gameID, websocket.EventNoteUpdated, payload, existing, senderID)
	}

	return existing, nil
}

// DeleteNote removes a note from the game
func (s *NoteService) DeleteNote(gameID string, noteID primitive.ObjectID, userID primitive.ObjectID) error {
	game, err := s.noteRepo.GetGame(gameID)
	if err != nil {
		return err
	}

	if !s.isParticipant(game, userID) {
		return fmt.Errorf("user is not a participant of this game")
	}

	existing := s.findNote(game, noteID)
	if existing == nil {
		return fmt.Errorf("note not found")
	}

	if !s.canAccessNote(existing, userID) {
		return fmt.Errorf("permission denied")
	}

	if err := s.noteRepo.DeleteNote(gameID, noteID); err != nil {
		return err
	}

	payload := map[string]interface{}{"noteId": noteID.Hex()}
	s.broadcastNote(gameID, websocket.EventNoteDeleted, payload, existing, userID.Hex())

	return nil
}

// FilterNotesForUser removes private notes that don't belong to the user.
// Call this before returning a Game document to a client.
func FilterNotesForUser(game *models.Game, userID primitive.ObjectID) {
	filtered := make([]models.Note, 0, len(game.Notes))
	for _, note := range game.Notes {
		if !note.IsPrivate || note.CreatorID == userID {
			filtered = append(filtered, note)
		}
	}
	game.Notes = filtered
}
