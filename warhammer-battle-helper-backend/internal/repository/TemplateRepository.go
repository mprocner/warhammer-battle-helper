package repository

import (
	"battle-helper/internal/models"
	"context"
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

func (r *TemplateRepository) Update(id string, name *string, sections []models.SectionDef, settings *models.TemplateSettings, isPublic *bool) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	objID, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return fmt.Errorf("invalid template id: %w", err)
	}

	update := bson.M{"$set": bson.M{"updatedAt": time.Now()}, "$inc": bson.M{"version": 1}}
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
