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

// ListVisibleToUser returns templates the user may use when creating a game: their own, every
// public one, and every one whose owner shared it with them by email — newest first. Token-config
// templates (BaseSystem set) are excluded — they carry no Sections and describe
// only the map-token overlay of a hardcoded system, so they are not selectable
// as a game system.
func (r *TemplateRepository) ListVisibleToUser(ownerID primitive.ObjectID) ([]models.SystemTemplate, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	filter := bson.M{
		"$or": bson.A{
			bson.M{"ownerId": ownerID},
			bson.M{"isPublic": true},
			// Mongo compares an array field against a scalar element-wise, so this reads
			// "ownerID is one of the shared-with ids", not "the array equals [ownerID]".
			// This is the query half of service.CanUseTemplate — keep the two in step.
			bson.M{"sharedWith": ownerID},
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

// FindByOwnerAndBaseSystem returns the caller's single token-config template for a
// hardcoded system (BaseSystem set), or (nil, nil) when none exists yet. The
// singleton per (ownerId, baseSystem) is enforced by GetOrCreateTokenConfig.
func (r *TemplateRepository) FindByOwnerAndBaseSystem(ownerID primitive.ObjectID, baseSystem string) (*models.SystemTemplate, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var t models.SystemTemplate
	err := r.collection.FindOne(ctx, bson.M{"ownerId": ownerID, "baseSystem": baseSystem}).Decode(&t)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (r *TemplateRepository) Update(id string, name *string, sections []models.SectionDef, settings *models.TemplateSettings, isPublic *bool, bumpVersion bool) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	objID, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return fmt.Errorf("invalid template id: %w", err)
	}

	update := bson.M{"$set": bson.M{"updatedAt": time.Now()}}
	// Version tracks the sheet the players see — lobby compares it against each game's embedded
	// copy to offer a sync. The caller (service) decides whether the sheet really changed, because
	// the creator sends the whole body on every save — visibility toggles and no-op autosaves
	// included — so field presence here says nothing.
	if bumpVersion {
		update["$inc"] = bson.M{"version": 1}
	}
	if name != nil {
		update["$set"].(bson.M)["name"] = *name
	}
	if sections != nil {
		update["$set"].(bson.M)["sections"] = sections
	}
	if settings != nil {
		update["$set"].(bson.M)["settings"] = *settings
	}
	if isPublic != nil {
		update["$set"].(bson.M)["isPublic"] = *isPublic
	}

	res, err := r.collection.UpdateOne(ctx, bson.M{"_id": objID}, update)
	if err != nil {
		return err
	}
	if res.MatchedCount == 0 {
		return fmt.Errorf("template not found")
	}
	return nil
}

// AddShare grants targetID read/clone access to a template ownerID owns. The ownership check IS
// the filter rather than a read before the write: authorisation and update are then one
// operation, with no window between them. $addToSet makes a repeated share a silent no-op
// without first reading the document.
func (r *TemplateRepository) AddShare(id string, ownerID, targetID primitive.ObjectID) error {
	return r.updateShares(id, ownerID, bson.M{"$addToSet": bson.M{"sharedWith": targetID}})
}

// RemoveShare revokes targetID's access. Pulling an id that is not there matches the document
// and changes nothing, so a double revoke is not an error — the caller gets the list as it is.
func (r *TemplateRepository) RemoveShare(id string, ownerID, targetID primitive.ObjectID) error {
	return r.updateShares(id, ownerID, bson.M{"$pull": bson.M{"sharedWith": targetID}})
}

// updateShares applies one share mutation and stamps updatedAt. Version is deliberately NOT
// incremented: it tracks the sheet the players see, and who may open a template changes nothing
// about its content.
func (r *TemplateRepository) updateShares(id string, ownerID primitive.ObjectID, mutation bson.M) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	objID, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return fmt.Errorf("invalid template id: %w", err)
	}

	mutation["$set"] = bson.M{"updatedAt": time.Now()}
	res, err := r.collection.UpdateOne(ctx, bson.M{"_id": objID, "ownerId": ownerID}, mutation)
	if err != nil {
		return err
	}
	if res.MatchedCount == 0 {
		return fmt.Errorf("template not found or not owned by user")
	}
	return nil
}

func (r *TemplateRepository) Delete(id string, ownerID primitive.ObjectID) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	objID, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return fmt.Errorf("invalid template id: %w", err)
	}

	res, err := r.collection.DeleteOne(ctx, bson.M{"_id": objID, "ownerId": ownerID})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return fmt.Errorf("template not found or not owned by user")
	}
	return nil
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

// UpdateContent saves name/sections/settings when the stored version still equals version and
// editorID may edit — optimistic locking with the authorisation in the same filter. The filter
// checks version even when nothing changes: a stale client is stale regardless of its payload.
// Only a real content change (bumpVersion, decided by the service) increments version — lobby
// compares it with each game's embedded copy to offer a sync — and records editorID in updatedBy.
func (r *TemplateRepository) UpdateContent(id string, version int, editorID primitive.ObjectID, name *string, sections []models.SectionDef, settings *models.TemplateSettings, bumpVersion bool) error {
	objID, err := templateObjectID(id)
	if err != nil {
		return err
	}
	set := bson.M{"updatedAt": time.Now()}
	if name != nil {
		set["name"] = *name
	}
	if sections != nil {
		set["sections"] = sections
	}
	if settings != nil {
		set["settings"] = *settings
	}
	update := bson.M{"$set": set}
	if bumpVersion {
		update["$inc"] = bson.M{"version": 1}
		set["updatedBy"] = editorID
	}
	filter := memberWith(editorID, models.ActionEdit)
	filter["_id"] = objID
	filter["version"] = version
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
