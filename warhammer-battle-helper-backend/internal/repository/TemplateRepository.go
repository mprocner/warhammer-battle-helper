package repository

import (
	"battle-helper/internal/models"
	"context"
	"errors"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type TemplateRepository struct {
	collection *mongo.Collection
}

func NewTemplateRepository(col *mongo.Collection) *TemplateRepository {
	return &TemplateRepository{collection: col}
}

func (r *TemplateRepository) Create(template *models.SystemTemplate) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	template.ID = primitive.NewObjectID()
	template.CreatedAt = time.Now()
	template.UpdatedAt = time.Now()
	template.Version = 1

	_, err := r.collection.InsertOne(ctx, template)
	return err
}

func (r *TemplateRepository) GetByID(id string) (*models.SystemTemplate, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	objID, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, fmt.Errorf("invalid template id: %w", err)
	}

	var t models.SystemTemplate
	if err := r.collection.FindOne(ctx, bson.M{"_id": objID}).Decode(&t); err != nil {
		return nil, err
	}
	return &t, nil
}

// GetVersionsByIDs returns the current version of every template in ids that still exists, in one
// round trip with only _id and version projected. A deleted template is simply absent from the map.
func (r *TemplateRepository) GetVersionsByIDs(ids []primitive.ObjectID) (map[primitive.ObjectID]int, error) {
	out := make(map[primitive.ObjectID]int, len(ids))
	if len(ids) == 0 {
		return out, nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	cursor, err := r.collection.Find(ctx, bson.M{"_id": bson.M{"$in": ids}},
		options.Find().SetProjection(bson.M{"_id": 1, "version": 1}))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	for cursor.Next(ctx) {
		var row struct {
			ID      primitive.ObjectID `bson:"_id"`
			Version int                `bson:"version"`
		}
		if err := cursor.Decode(&row); err != nil {
			return nil, err
		}
		out[row.ID] = row.Version
	}
	return out, cursor.Err()
}

// ErrTemplateNoMatch means a conditional template write matched no document: the template is
// gone, the caller lacks the role the filter requires, the version moved on, or the write would
// leave the template without an owner. The repository cannot tell which; the service re-reads the
// document to find out. Authorisation lives in the filter so check and write are one operation.
var ErrTemplateNoMatch = errors.New("template write matched no document")

func templateObjectID(id string) (primitive.ObjectID, error) {
	objID, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return primitive.NilObjectID, fmt.Errorf("invalid template id: %w", err)
	}
	return objID, nil
}

// memberWith matches templates where userID holds a role that grants a.
func memberWith(userID primitive.ObjectID, a models.TemplateAction) bson.M {
	return bson.M{"members": bson.M{"$elemMatch": bson.M{
		"userId": userID,
		"role":   bson.M{"$in": models.RolesWith(a)},
	}}}
}

// keepsAnOwnerWithout matches templates that still have an owner once userID stops being one:
// userID is a member below owner, or some other member is an owner.
func keepsAnOwnerWithout(userID primitive.ObjectID) bson.M {
	return bson.M{"$or": bson.A{
		bson.M{"members": bson.M{"$elemMatch": bson.M{"userId": userID, "role": bson.M{"$ne": models.RoleOwner}}}},
		bson.M{"members": bson.M{"$elemMatch": bson.M{"userId": bson.M{"$ne": userID}, "role": models.RoleOwner}}},
	}}
}

// conditionalUpdate runs one UpdateOne and maps "nothing matched" to ErrTemplateNoMatch.
func (r *TemplateRepository) conditionalUpdate(filter, update bson.M, opts ...*options.UpdateOptions) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	res, err := r.collection.UpdateOne(ctx, filter, update, opts...)
	if err != nil {
		return err
	}
	if res.MatchedCount == 0 {
		return ErrTemplateNoMatch
	}
	return nil
}

// ListVisibleToMember returns templates the user may use when creating a game: every one they are
// a member of and every public one, newest first. Token-config templates are excluded — they are
// not selectable game systems. This is the query half of service.CanOnTemplate(…, ActionUse).
func (r *TemplateRepository) ListVisibleToMember(userID primitive.ObjectID) ([]models.SystemTemplate, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	filter := bson.M{
		"$or": bson.A{
			// Mongo matches an array field element-wise: "some member has this userId".
			bson.M{"members.userId": userID},
			bson.M{"isPublic": true},
		},
		"baseSystem": bson.M{"$in": bson.A{"", nil}},
	}
	cursor, err := r.collection.Find(ctx, filter, options.Find().SetSort(bson.M{"createdAt": -1}))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var templates []models.SystemTemplate
	if err := cursor.All(ctx, &templates); err != nil {
		return nil, err
	}
	return templates, nil
}

// FindTokenConfig returns the user's token-config singleton for a hardcoded system, or (nil, nil)
// when none exists yet. GetOrCreateTokenConfig enforces the singleton per (owner, baseSystem).
func (r *TemplateRepository) FindTokenConfig(userID primitive.ObjectID, baseSystem string) (*models.SystemTemplate, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	filter := bson.M{
		"baseSystem": baseSystem,
		"members":    bson.M{"$elemMatch": bson.M{"userId": userID, "role": models.RoleOwner}},
	}
	var t models.SystemTemplate
	err := r.collection.FindOne(ctx, filter).Decode(&t)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &t, nil
}

// UpdateContent saves the content fields present in req (name, sections, settings, description,
// language) when the stored version still equals *req.Version (the caller guarantees it is set)
// and editorID may edit — optimistic locking with the authorisation in the same filter. The
// filter checks version even when nothing changes: a stale client is stale regardless of its
// payload. Only a real content change (bumpVersion, decided by the service) increments version —
// lobby compares it with each game's embedded copy to offer a sync — and records editorID in
// updatedBy. Description and language go through a bson.M, so "" is written explicitly (clearing).
func (r *TemplateRepository) UpdateContent(id string, editorID primitive.ObjectID, req models.UpdateTemplateRequest, bumpVersion bool) error {
	objID, err := templateObjectID(id)
	if err != nil {
		return err
	}
	set := bson.M{"updatedAt": time.Now()}
	if req.Name != nil {
		set["name"] = *req.Name
	}
	if req.Sections != nil {
		set["sections"] = req.Sections
	}
	if req.Settings != nil {
		set["settings"] = *req.Settings
	}
	if req.Description != nil {
		set["description"] = *req.Description
	}
	if req.Language != nil {
		set["language"] = *req.Language
	}
	update := bson.M{"$set": set}
	if bumpVersion {
		update["$inc"] = bson.M{"version": 1}
		set["updatedBy"] = editorID
	}
	filter := memberWith(editorID, models.ActionEdit)
	filter["_id"] = objID
	filter["version"] = *req.Version
	return r.conditionalUpdate(filter, update)
}

// SetVisibility sets isPublic when callerID may share. Version is untouched: who may open a
// template changes nothing about its content.
func (r *TemplateRepository) SetVisibility(id string, callerID primitive.ObjectID, isPublic bool) error {
	objID, err := templateObjectID(id)
	if err != nil {
		return err
	}
	filter := memberWith(callerID, models.ActionShare)
	filter["_id"] = objID
	return r.conditionalUpdate(filter, bson.M{"$set": bson.M{"isPublic": isPublic, "updatedAt": time.Now()}})
}

// AddMember appends member when callerID may share and member.UserID is not yet a member.
func (r *TemplateRepository) AddMember(id string, callerID primitive.ObjectID, member models.TemplateMember) error {
	objID, err := templateObjectID(id)
	if err != nil {
		return err
	}
	filter := bson.M{"_id": objID, "$and": bson.A{
		memberWith(callerID, models.ActionShare),
		bson.M{"members.userId": bson.M{"$ne": member.UserID}},
	}}
	return r.conditionalUpdate(filter, bson.M{
		"$push": bson.M{"members": member},
		"$set":  bson.M{"updatedAt": time.Now()},
	})
}

// SetMemberRole changes targetID's role when callerID may share. Any role below owner also
// requires the template to keep another owner, so two owners demoting each other at the same
// moment cannot both succeed.
func (r *TemplateRepository) SetMemberRole(id string, callerID, targetID primitive.ObjectID, role string) error {
	objID, err := templateObjectID(id)
	if err != nil {
		return err
	}
	conds := bson.A{memberWith(callerID, models.ActionShare), bson.M{"members.userId": targetID}}
	if role != models.RoleOwner {
		conds = append(conds, keepsAnOwnerWithout(targetID))
	}
	return r.conditionalUpdate(
		bson.M{"_id": objID, "$and": conds},
		bson.M{"$set": bson.M{"members.$[m].role": role, "updatedAt": time.Now()}},
		options.Update().SetArrayFilters(options.ArrayFilters{Filters: []interface{}{bson.M{"m.userId": targetID}}}),
	)
}

// RemoveMember pulls targetID when callerID may share and the template keeps an owner.
func (r *TemplateRepository) RemoveMember(id string, callerID, targetID primitive.ObjectID) error {
	objID, err := templateObjectID(id)
	if err != nil {
		return err
	}
	filter := bson.M{"_id": objID, "$and": bson.A{
		memberWith(callerID, models.ActionShare),
		bson.M{"members.userId": targetID},
		keepsAnOwnerWithout(targetID),
	}}
	return r.conditionalUpdate(filter, bson.M{
		"$pull": bson.M{"members": bson.M{"userId": targetID}},
		"$set":  bson.M{"updatedAt": time.Now()},
	})
}

// Leave pulls userID from the members of a template they belong to, unless they are its last owner.
func (r *TemplateRepository) Leave(id string, userID primitive.ObjectID) error {
	objID, err := templateObjectID(id)
	if err != nil {
		return err
	}
	filter := bson.M{"_id": objID, "$and": bson.A{
		bson.M{"members.userId": userID},
		keepsAnOwnerWithout(userID),
	}}
	return r.conditionalUpdate(filter, bson.M{
		"$pull": bson.M{"members": bson.M{"userId": userID}},
		"$set":  bson.M{"updatedAt": time.Now()},
	})
}

// DeleteAsMember deletes the template when callerID holds a role that may delete it.
func (r *TemplateRepository) DeleteAsMember(id string, callerID primitive.ObjectID) error {
	objID, err := templateObjectID(id)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	filter := memberWith(callerID, models.ActionDelete)
	filter["_id"] = objID
	res, err := r.collection.DeleteOne(ctx, filter)
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return ErrTemplateNoMatch
	}
	return nil
}

// PullMemberEverywhere removes a deleted account from every template. A template whose only owner
// it was is left ownerless — usable by its members, editable by nobody (PLAYRPG-279 leaves
// reassigning an owner to a separate admin ticket).
func (r *TemplateRepository) PullMemberEverywhere(userID primitive.ObjectID) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_, err := r.collection.UpdateMany(ctx,
		bson.M{"members.userId": userID},
		bson.M{"$pull": bson.M{"members": bson.M{"userId": userID}}},
	)
	return err
}
