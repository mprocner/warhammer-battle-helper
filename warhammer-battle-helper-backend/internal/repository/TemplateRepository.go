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

// ListVisibleToUser returns templates the user may use when creating a game:
// their own templates plus every public template, newest first.
func (r *TemplateRepository) ListVisibleToUser(ownerID primitive.ObjectID) ([]models.SystemTemplate, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	filter := bson.M{"$or": bson.A{
		bson.M{"ownerId": ownerID},
		bson.M{"isPublic": true},
	}}
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
