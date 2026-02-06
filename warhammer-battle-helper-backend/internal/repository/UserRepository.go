package repository

import (
	"battle-helper/internal/models"
	"context"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

type UserRepository struct {
	Collection *mongo.Collection
}

func NewUserRepository(col *mongo.Collection) *UserRepository {
	return &UserRepository{Collection: col}
}

func (r *UserRepository) FindByEmail(email string) (*models.User, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var user models.User
	err := r.Collection.FindOne(ctx, bson.M{"email": email}).Decode(&user)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *UserRepository) Create(user *models.User) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := r.Collection.InsertOne(ctx, user)
	return err
}

func (r *UserRepository) FindByID(id primitive.ObjectID) (*models.User, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var user models.User
	err := r.Collection.FindOne(ctx, bson.M{"_id": id}).Decode(&user)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// GetUserWithFiles returns user with files and folders
func (r *UserRepository) GetUserWithFiles(userID primitive.ObjectID) (*models.User, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var user models.User
	err := r.Collection.FindOne(ctx, bson.M{"_id": userID}).Decode(&user)
	if err != nil {
		return nil, err
	}

	// Initialize empty slices if nil
	if user.Files == nil {
		user.Files = []models.UserFile{}
	}
	if user.Folders == nil {
		user.Folders = []models.UserFolder{}
	}

	return &user, nil
}

// AddFiles adds multiple files to user's files array
func (r *UserRepository) AddFiles(userID primitive.ObjectID, files []models.UserFile) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// First, ensure files field is an array (not null)
	_, err := r.Collection.UpdateOne(ctx,
		bson.M{"_id": userID, "files": nil},
		bson.M{"$set": bson.M{"files": bson.A{}}},
	)
	if err != nil {
		return err
	}

	// Now push the files
	update := bson.M{
		"$push": bson.M{
			"files": bson.M{"$each": files},
		},
	}

	_, err = r.Collection.UpdateOne(ctx, bson.M{"_id": userID}, update)
	return err
}

// DeleteFile removes a file from user's files array and returns the deleted file
func (r *UserRepository) DeleteFile(userID primitive.ObjectID, fileID primitive.ObjectID) (*models.UserFile, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// First, get the file to return it
	var user models.User
	err := r.Collection.FindOne(ctx, bson.M{"_id": userID}).Decode(&user)
	if err != nil {
		return nil, err
	}

	var deletedFile *models.UserFile
	for _, f := range user.Files {
		if f.ID == fileID {
			deletedFile = &f
			break
		}
	}

	if deletedFile == nil {
		return nil, mongo.ErrNoDocuments
	}

	// Now delete the file
	update := bson.M{
		"$pull": bson.M{
			"files": bson.M{"_id": fileID},
		},
	}

	_, err = r.Collection.UpdateOne(ctx, bson.M{"_id": userID}, update)
	if err != nil {
		return nil, err
	}

	return deletedFile, nil
}

// AddFolder adds a new folder to user's folders array
func (r *UserRepository) AddFolder(userID primitive.ObjectID, folder models.UserFolder) (*models.UserFolder, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	folder.ID = primitive.NewObjectID()
	folder.CreatedAt = time.Now()
	folder.UpdatedAt = time.Now()

	// First, ensure folders field is an array (not null)
	_, err := r.Collection.UpdateOne(ctx,
		bson.M{"_id": userID, "folders": nil},
		bson.M{"$set": bson.M{"folders": bson.A{}}},
	)
	if err != nil {
		return nil, err
	}

	// Now push the folder
	update := bson.M{
		"$push": bson.M{
			"folders": folder,
		},
	}

	_, err = r.Collection.UpdateOne(ctx, bson.M{"_id": userID}, update)
	if err != nil {
		return nil, err
	}

	return &folder, nil
}

// UpdateFolder updates a folder's name in user's folders array
func (r *UserRepository) UpdateFolder(userID primitive.ObjectID, folderID primitive.ObjectID, name string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	filter := bson.M{
		"_id":         userID,
		"folders._id": folderID,
	}

	update := bson.M{
		"$set": bson.M{
			"folders.$.name":      name,
			"folders.$.updatedAt": time.Now(),
		},
	}

	result, err := r.Collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return err
	}

	if result.MatchedCount == 0 {
		return mongo.ErrNoDocuments
	}

	return nil
}

// DeleteFolder removes a folder from user's folders array
func (r *UserRepository) DeleteFolder(userID primitive.ObjectID, folderID primitive.ObjectID) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	update := bson.M{
		"$pull": bson.M{
			"folders": bson.M{"_id": folderID},
		},
	}

	_, err := r.Collection.UpdateOne(ctx, bson.M{"_id": userID}, update)
	return err
}

// DeleteFilesInFolder removes all files in a specific folder
func (r *UserRepository) DeleteFilesInFolder(userID primitive.ObjectID, folderID primitive.ObjectID) ([]models.UserFile, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// First get files to be deleted
	var user models.User
	err := r.Collection.FindOne(ctx, bson.M{"_id": userID}).Decode(&user)
	if err != nil {
		return nil, err
	}

	var deletedFiles []models.UserFile
	for _, f := range user.Files {
		if f.FolderID != nil && *f.FolderID == folderID {
			deletedFiles = append(deletedFiles, f)
		}
	}

	// Delete all files in the folder
	update := bson.M{
		"$pull": bson.M{
			"files": bson.M{"folderId": folderID},
		},
	}

	_, err = r.Collection.UpdateOne(ctx, bson.M{"_id": userID}, update)
	if err != nil {
		return nil, err
	}

	return deletedFiles, nil
}

// GetSubfolders returns all subfolders of a folder (for recursive deletion)
func (r *UserRepository) GetSubfolders(userID primitive.ObjectID, parentID primitive.ObjectID) ([]models.UserFolder, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var user models.User
	err := r.Collection.FindOne(ctx, bson.M{"_id": userID}).Decode(&user)
	if err != nil {
		return nil, err
	}

	var subfolders []models.UserFolder
	for _, f := range user.Folders {
		if f.ParentID != nil && *f.ParentID == parentID {
			subfolders = append(subfolders, f)
		}
	}

	return subfolders, nil
}

// MoveFile updates a file's folderId to move it to another folder
func (r *UserRepository) MoveFile(userID primitive.ObjectID, fileID primitive.ObjectID, folderID *primitive.ObjectID) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	filter := bson.M{
		"_id":       userID,
		"files._id": fileID,
	}

	update := bson.M{
		"$set": bson.M{
			"files.$.folderId":  folderID,
			"files.$.updatedAt": time.Now(),
		},
	}

	result, err := r.Collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return err
	}

	if result.MatchedCount == 0 {
		return mongo.ErrNoDocuments
	}

	return nil
}
