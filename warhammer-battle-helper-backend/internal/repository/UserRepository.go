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

func (r *UserRepository) FindByActivationToken(token string) (*models.User, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var user models.User
	err := r.Collection.FindOne(ctx, bson.M{"activationToken": token}).Decode(&user)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *UserRepository) ActivateUser(id primitive.ObjectID) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	now := time.Now()
	_, err := r.Collection.UpdateOne(ctx,
		bson.M{"_id": id},
		bson.M{"$set": bson.M{"active": true, "activationToken": "", "activatedAt": now, "updatedAt": now}},
	)
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

// settingsUpdateFields builds a partial $set document — one key per field present in the
// request. An empty map means the caller sent nothing worth writing.
func settingsUpdateFields(req models.UpdateSettingsRequest) bson.M {
	fields := bson.M{}
	if req.SceneControlScheme != nil {
		fields["settings.sceneControlScheme"] = *req.SceneControlScheme
	}
	if req.FogGmOpacity != nil {
		fields["settings.fogGmOpacity"] = *req.FogGmOpacity
	}
	return fields
}

func (r *UserRepository) UpdateSettings(id primitive.ObjectID, req models.UpdateSettingsRequest) error {
	fields := settingsUpdateFields(req)
	if len(fields) == 0 {
		return nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := r.Collection.UpdateOne(ctx,
		bson.M{"_id": id},
		bson.M{"$set": fields},
	)
	return err
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

func (r *UserRepository) SetResetToken(id primitive.ObjectID, token string, expiry time.Time) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := r.Collection.UpdateOne(ctx,
		bson.M{"_id": id},
		bson.M{"$set": bson.M{"resetToken": token, "resetTokenExpiry": expiry}},
	)
	return err
}

func (r *UserRepository) FindByResetToken(token string) (*models.User, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var user models.User
	err := r.Collection.FindOne(ctx, bson.M{"resetToken": token}).Decode(&user)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// UpdateProfile updates user's avatar and signature
func (r *UserRepository) UpdateProfile(id primitive.ObjectID, avatar, signature string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := r.Collection.UpdateOne(ctx,
		bson.M{"_id": id},
		bson.M{"$set": bson.M{"avatar": avatar, "signature": signature}},
	)
	return err
}

// FindByIDs retrieves multiple users by their IDs (batch query)
func (r *UserRepository) FindByIDs(ids []primitive.ObjectID) ([]models.User, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	cursor, err := r.Collection.Find(ctx, bson.M{"_id": bson.M{"$in": ids}})
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var users []models.User
	if err := cursor.All(ctx, &users); err != nil {
		return nil, err
	}
	return users, nil
}

func (r *UserRepository) UpdatePassword(id primitive.ObjectID, hashedPassword string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := r.Collection.UpdateOne(ctx,
		bson.M{"_id": id},
		bson.M{"$set": bson.M{"password": hashedPassword}},
	)
	return err
}

func (r *UserRepository) UpdatePasswordAndClearToken(id primitive.ObjectID, hashedPassword string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := r.Collection.UpdateOne(ctx,
		bson.M{"_id": id},
		bson.M{"$set": bson.M{"password": hashedPassword, "resetToken": "", "resetTokenExpiry": time.Time{}}},
	)
	return err
}

// --- MUSIC METHODS ---

// GetUserWithMusic returns user with music files, folders and playlists
func (r *UserRepository) GetUserWithMusic(userID primitive.ObjectID) (*models.User, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var user models.User
	err := r.Collection.FindOne(ctx, bson.M{"_id": userID}).Decode(&user)
	if err != nil {
		return nil, err
	}

	if user.Music == nil {
		user.Music = []models.MusicFile{}
	}
	if user.MusicFolders == nil {
		user.MusicFolders = []models.MusicFolder{}
	}
	if user.Playlists == nil {
		user.Playlists = []models.Playlist{}
	}

	return &user, nil
}

// AddMusicFolder adds a new folder to user's musicFolders array
func (r *UserRepository) AddMusicFolder(userID primitive.ObjectID, folder models.MusicFolder) (*models.MusicFolder, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	folder.ID = primitive.NewObjectID()
	folder.CreatedAt = time.Now()
	folder.UpdatedAt = time.Now()

	_, err := r.Collection.UpdateOne(ctx,
		bson.M{"_id": userID, "musicFolders": nil},
		bson.M{"$set": bson.M{"musicFolders": bson.A{}}},
	)
	if err != nil {
		return nil, err
	}

	update := bson.M{"$push": bson.M{"musicFolders": folder}}
	_, err = r.Collection.UpdateOne(ctx, bson.M{"_id": userID}, update)
	if err != nil {
		return nil, err
	}

	return &folder, nil
}

// UpdateMusicFolder updates a music folder's name
func (r *UserRepository) UpdateMusicFolder(userID primitive.ObjectID, folderID primitive.ObjectID, name string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	filter := bson.M{"_id": userID, "musicFolders._id": folderID}
	update := bson.M{"$set": bson.M{
		"musicFolders.$.name":      name,
		"musicFolders.$.updatedAt": time.Now(),
	}}

	result, err := r.Collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return err
	}
	if result.MatchedCount == 0 {
		return mongo.ErrNoDocuments
	}
	return nil
}

// DeleteMusicFolder removes a folder from user's musicFolders array
func (r *UserRepository) DeleteMusicFolder(userID primitive.ObjectID, folderID primitive.ObjectID) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	update := bson.M{"$pull": bson.M{"musicFolders": bson.M{"_id": folderID}}}
	_, err := r.Collection.UpdateOne(ctx, bson.M{"_id": userID}, update)
	return err
}

// DeleteMusicFilesInFolder removes all music files in a specific folder and returns them
func (r *UserRepository) DeleteMusicFilesInFolder(userID primitive.ObjectID, folderID primitive.ObjectID) ([]models.MusicFile, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var user models.User
	err := r.Collection.FindOne(ctx, bson.M{"_id": userID}).Decode(&user)
	if err != nil {
		return nil, err
	}

	var deleted []models.MusicFile
	for _, f := range user.Music {
		if f.FolderID != nil && *f.FolderID == folderID {
			deleted = append(deleted, f)
		}
	}

	update := bson.M{"$pull": bson.M{"music": bson.M{"folderId": folderID}}}
	_, err = r.Collection.UpdateOne(ctx, bson.M{"_id": userID}, update)
	if err != nil {
		return nil, err
	}

	return deleted, nil
}

// GetMusicSubfolders returns all direct subfolders of a music folder
func (r *UserRepository) GetMusicSubfolders(userID primitive.ObjectID, parentID primitive.ObjectID) ([]models.MusicFolder, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var user models.User
	err := r.Collection.FindOne(ctx, bson.M{"_id": userID}).Decode(&user)
	if err != nil {
		return nil, err
	}

	var subfolders []models.MusicFolder
	for _, f := range user.MusicFolders {
		if f.ParentID != nil && *f.ParentID == parentID {
			subfolders = append(subfolders, f)
		}
	}
	return subfolders, nil
}

// MoveMusicFile updates a music file's folderId
func (r *UserRepository) MoveMusicFile(userID primitive.ObjectID, fileID primitive.ObjectID, folderID *primitive.ObjectID) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	filter := bson.M{"_id": userID, "music._id": fileID}
	update := bson.M{"$set": bson.M{"music.$.folderId": folderID}}

	result, err := r.Collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return err
	}
	if result.MatchedCount == 0 {
		return mongo.ErrNoDocuments
	}
	return nil
}

// AddMusicFiles adds multiple music files to user's music array
func (r *UserRepository) AddMusicFiles(userID primitive.ObjectID, files []models.MusicFile) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Ensure music field is an array (not null)
	_, err := r.Collection.UpdateOne(ctx,
		bson.M{"_id": userID, "music": nil},
		bson.M{"$set": bson.M{"music": bson.A{}}},
	)
	if err != nil {
		return err
	}

	update := bson.M{
		"$push": bson.M{
			"music": bson.M{"$each": files},
		},
	}

	_, err = r.Collection.UpdateOne(ctx, bson.M{"_id": userID}, update)
	return err
}

// DeleteMusicFile removes a music file from user's music array and returns the deleted file
func (r *UserRepository) DeleteMusicFile(userID primitive.ObjectID, fileID primitive.ObjectID) (*models.MusicFile, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var user models.User
	err := r.Collection.FindOne(ctx, bson.M{"_id": userID}).Decode(&user)
	if err != nil {
		return nil, err
	}

	var deletedFile *models.MusicFile
	for _, f := range user.Music {
		if f.ID == fileID {
			deletedFile = &f
			break
		}
	}

	if deletedFile == nil {
		return nil, mongo.ErrNoDocuments
	}

	update := bson.M{
		"$pull": bson.M{
			"music": bson.M{"_id": fileID},
		},
	}

	_, err = r.Collection.UpdateOne(ctx, bson.M{"_id": userID}, update)
	if err != nil {
		return nil, err
	}

	return deletedFile, nil
}

// AddPlaylist adds a new playlist to user's playlists array
func (r *UserRepository) AddPlaylist(userID primitive.ObjectID, playlist models.Playlist) (*models.Playlist, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	playlist.ID = primitive.NewObjectID()
	playlist.CreatedAt = time.Now()
	playlist.UpdatedAt = time.Now()
	if playlist.Tracks == nil {
		playlist.Tracks = []primitive.ObjectID{}
	}

	// Ensure playlists field is an array (not null)
	_, err := r.Collection.UpdateOne(ctx,
		bson.M{"_id": userID, "playlists": nil},
		bson.M{"$set": bson.M{"playlists": bson.A{}}},
	)
	if err != nil {
		return nil, err
	}

	update := bson.M{
		"$push": bson.M{
			"playlists": playlist,
		},
	}

	_, err = r.Collection.UpdateOne(ctx, bson.M{"_id": userID}, update)
	if err != nil {
		return nil, err
	}

	return &playlist, nil
}

// UpdatePlaylist updates a playlist's name and tracks
func (r *UserRepository) UpdatePlaylist(userID primitive.ObjectID, playlistID primitive.ObjectID, name string, tracks []primitive.ObjectID) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	filter := bson.M{
		"_id":           userID,
		"playlists._id": playlistID,
	}

	update := bson.M{
		"$set": bson.M{
			"playlists.$.name":      name,
			"playlists.$.tracks":    tracks,
			"playlists.$.updatedAt": time.Now(),
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

// DeletePlaylist removes a playlist from user's playlists array
func (r *UserRepository) DeletePlaylist(userID primitive.ObjectID, playlistID primitive.ObjectID) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	update := bson.M{
		"$pull": bson.M{
			"playlists": bson.M{"_id": playlistID},
		},
	}

	_, err := r.Collection.UpdateOne(ctx, bson.M{"_id": userID}, update)
	return err
}

// ReorderPlaylists reorders user's playlists array to match the given ID order
func (r *UserRepository) ReorderPlaylists(userID primitive.ObjectID, playlistIDs []string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var user models.User
	err := r.Collection.FindOne(ctx, bson.M{"_id": userID}).Decode(&user)
	if err != nil {
		return err
	}

	// Build map of playlist ID -> playlist
	playlistMap := make(map[string]models.Playlist)
	for _, p := range user.Playlists {
		playlistMap[p.ID.Hex()] = p
	}

	// Rebuild array in requested order
	reordered := make([]models.Playlist, 0, len(playlistIDs))
	for _, idStr := range playlistIDs {
		if p, ok := playlistMap[idStr]; ok {
			reordered = append(reordered, p)
		}
	}

	update := bson.M{
		"$set": bson.M{
			"playlists": reordered,
		},
	}

	_, err = r.Collection.UpdateOne(ctx, bson.M{"_id": userID}, update)
	return err
}

// --- END MUSIC METHODS ---

// RenameFile updates a file's display name in user's files array
func (r *UserRepository) RenameFile(userID primitive.ObjectID, fileID primitive.ObjectID, name string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	filter := bson.M{
		"_id":       userID,
		"files._id": fileID,
	}

	update := bson.M{
		"$set": bson.M{
			"files.$.name":      name,
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

// RenameMusicFile updates a music file's display name in user's music array
func (r *UserRepository) RenameMusicFile(userID primitive.ObjectID, fileID primitive.ObjectID, name string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	filter := bson.M{
		"_id":       userID,
		"music._id": fileID,
	}

	update := bson.M{
		"$set": bson.M{
			"music.$.name": name,
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

// UpdateMusicFileDuration sets the duration field for a specific music file.
func (r *UserRepository) UpdateMusicFileDuration(userID, musicID primitive.ObjectID, duration float64) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	filter := bson.M{"_id": userID, "music._id": musicID}
	update := bson.M{"$set": bson.M{"music.$.duration": duration}}

	_, err := r.Collection.UpdateOne(ctx, filter, update)
	return err
}

// GetMusicFilesByIDs returns music files from a user's library that match the given IDs.
func (r *UserRepository) GetMusicFilesByIDs(userID primitive.ObjectID, ids []primitive.ObjectID) ([]models.MusicFile, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var user models.User
	if err := r.Collection.FindOne(ctx, bson.M{"_id": userID}).Decode(&user); err != nil {
		return nil, err
	}

	idSet := make(map[primitive.ObjectID]bool, len(ids))
	for _, id := range ids {
		idSet[id] = true
	}

	var result []models.MusicFile
	for _, f := range user.Music {
		if idSet[f.ID] {
			result = append(result, f)
		}
	}
	return result, nil
}
