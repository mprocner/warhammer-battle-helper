import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core';
import { getFiles, uploadFiles, deleteFile, getFileUsage, moveFile, createFolder, renameFolder, deleteFolder } from '../../api/files';
import { addSceneImage } from '../../api/scenes';
import { getApiUrl } from '../../api/axios';
import ConfirmModal from '../common/ConfirmModal';
import './FilesTab.css';

// Helper to get full URL for file
const getFileUrl = (fileUrl) => {
  if (!fileUrl) return '';
  return fileUrl.startsWith('http') ? fileUrl : `${getApiUrl()}${fileUrl}`;
};

// Draggable file item component
const DraggableFileItem = ({ file, onPreview, onDelete, onHover, onAddToScene, t }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `file-${file.id}`,
    data: { type: 'file', file },
  });

  const handleMouseEnter = () => {
    if (!isDragging) onHover(file);
  };

  const handleMouseLeave = () => {
    onHover(null);
  };

  const handleClick = () => {
    if (!isDragging) {
      onHover(null);
      onPreview(file);
    }
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    onHover(null);
    onDelete(file);
  };

  return (
    <div
      ref={setNodeRef}
      className={`files-tab__item files-tab__item--file ${isDragging ? 'files-tab__item--dragging' : ''}`}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...listeners}
      {...attributes}
    >
      <img
        src={getFileUrl(file.fileUrl)}
        alt={file.name}
        className="files-tab__item-thumbnail"
        draggable={false}
      />
      <span className="files-tab__item-name" title={file.name}>
        {file.name}
      </span>
      <div className="files-tab__item-actions">
        {onAddToScene && (
          <button
            className="list-action-btn"
            onClick={(e) => { e.stopPropagation(); onHover(null); onAddToScene(file); }}
            title={t('scenes.addToScene')}
          >
            🗺️
          </button>
        )}
        <button
          className="list-action-btn list-action-btn--delete"
          onClick={handleDelete}
          title={t('common.delete')}
        >
          ✕
        </button>
      </div>
    </div>
  );
};

// Droppable folder item component
const DroppableFolderItem = ({ folder, isOver, onNavigate, onRename, onDelete, renamingFolder, renameValue, setRenameValue, setRenamingFolder, handleRenameFolder, t }) => {
  const { setNodeRef, isOver: isOverCurrent } = useDroppable({
    id: `folder-${folder.id}`,
    data: { type: 'folder', folderId: folder.id },
  });

  const isDropTarget = isOver || isOverCurrent;

  return (
    <div
      ref={setNodeRef}
      className={`files-tab__item files-tab__item--folder ${isDropTarget ? 'files-tab__item--drop-target' : ''}`}
      onClick={() => onNavigate(folder)}
    >
      <span className="files-tab__item-icon">📁</span>
      {renamingFolder?.id === folder.id ? (
        <form onSubmit={handleRenameFolder} className="files-tab__rename-form">
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={() => setRenamingFolder(null)}
            autoFocus
          />
        </form>
      ) : (
        <span className="files-tab__item-name">{folder.name}</span>
      )}
      <div className="files-tab__item-actions">
        <button
          className="list-action-btn"
          onClick={(e) => onRename(folder, e)}
          title={t('files.renameFolder')}
        >
          ✏️
        </button>
        <button
          className="list-action-btn list-action-btn--delete"
          onClick={(e) => { e.stopPropagation(); onDelete(folder); }}
          title={t('common.delete')}
        >
          ✕
        </button>
      </div>
    </div>
  );
};

// Droppable back button component
const DroppableBackButton = ({ parentFolderId, onNavigateUp }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: 'parent-folder',
    data: { type: 'parent', folderId: parentFolderId },
  });

  return (
    <div
      ref={setNodeRef}
      className={`files-tab__item files-tab__item--back ${isOver ? 'files-tab__item--drop-target' : ''}`}
      onClick={onNavigateUp}
    >
      <span className="files-tab__item-icon">⬆️</span>
      <span className="files-tab__item-name">..</span>
    </div>
  );
};

/**
 * Files tab - manages user's image files repository (GM only)
 */
const FilesTab = ({ token, gameId, currentSceneId }) => {
  const { t } = useTranslation();
  const fileInputRef = useRef(null);

  const [files, setFiles] = useState([]);
  const [folders, setFolders] = useState([]);
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [folderPath, setFolderPath] = useState([]); // Breadcrumb path
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [previewFile, setPreviewFile] = useState(null);
  const [renamingFolder, setRenamingFolder] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [draggingFile, setDraggingFile] = useState(null);
  const [hoveredFile, setHoveredFile] = useState(null);
  const [addToSceneFile, setAddToSceneFile] = useState(null);
  const [addToSceneLayer, setAddToSceneLayer] = useState('background');
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, file: null, message: '', isLoading: false });

  const handleAddToScene = async () => {
    if (!addToSceneFile || !gameId || !currentSceneId) return;

    try {
      await addSceneImage(gameId, currentSceneId, {
        fileUrl: addToSceneFile.fileUrl,
        fileName: addToSceneFile.name,
        layer: addToSceneLayer,
        x: 0,
        y: 0,
        width: 200,
        height: 200,
      });
      setAddToSceneFile(null);
      setAddToSceneLayer('background');
    } catch (err) {
      console.error('Failed to add image to scene:', err);
      setError(t('scenes.addImageError'));
    }
  };

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Fetch files and folders
  const fetchFiles = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await getFiles();
      setFiles(data.files || []);
      setFolders(data.folders || []);
      setError('');
    } catch (err) {
      console.error('Failed to fetch files:', err);
      setError(t('files.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // Get files and folders for current directory
  const currentFiles = files.filter(f => {
    if (currentFolderId === null) {
      return !f.folderId;
    }
    return f.folderId === currentFolderId;
  }).sort((a, b) => a.name.localeCompare(b.name));

  const currentFolders = folders.filter(f => {
    if (currentFolderId === null) {
      return !f.parentId;
    }
    return f.parentId === currentFolderId;
  }).sort((a, b) => a.name.localeCompare(b.name));

  // Get parent folder ID for back button drop target
  const parentFolderId = folderPath.length > 1
    ? folderPath[folderPath.length - 2].id
    : null;

  // Navigate to folder
  const navigateToFolder = (folder) => {
    setCurrentFolderId(folder.id);
    setFolderPath(prev => [...prev, folder]);
  };

  // Navigate back in breadcrumb
  const navigateToBreadcrumb = (index) => {
    if (index === -1) {
      // Root
      setCurrentFolderId(null);
      setFolderPath([]);
    } else {
      const folder = folderPath[index];
      setCurrentFolderId(folder.id);
      setFolderPath(folderPath.slice(0, index + 1));
    }
  };

  // Navigate up one level
  const navigateUp = () => {
    if (folderPath.length > 0) {
      const newPath = folderPath.slice(0, -1);
      const parentFolder = newPath[newPath.length - 1];
      setCurrentFolderId(parentFolder?.id || null);
      setFolderPath(newPath);
    }
  };

  // Handle drag start
  const handleDragStart = (event) => {
    const { active } = event;
    if (active.data.current?.type === 'file') {
      setDraggingFile(active.data.current.file);
      setHoveredFile(null);
    }
  };

  // Handle drag end - move file to folder
  const handleDragEnd = async (event) => {
    const { active, over } = event;
    setDraggingFile(null);

    if (!over || !active.data.current?.file) return;

    const file = active.data.current.file;
    const targetData = over.data.current;

    if (!targetData) return;

    let targetFolderId = null;

    if (targetData.type === 'folder') {
      targetFolderId = targetData.folderId;
    } else if (targetData.type === 'parent') {
      targetFolderId = targetData.folderId; // null for root
    } else {
      return;
    }

    // Don't move if already in target folder
    if (file.folderId === targetFolderId || (!file.folderId && !targetFolderId)) {
      return;
    }

    try {
      await moveFile(file.id, targetFolderId);
      // Update local state
      setFiles(prev => prev.map(f =>
        f.id === file.id ? { ...f, folderId: targetFolderId } : f
      ));
    } catch (err) {
      console.error('Failed to move file:', err);
      setError(t('files.fileMoveError'));
    }
  };

  // Handle file upload (from external drag)
  const handleUpload = async (fileList) => {
    const validFiles = Array.from(fileList).filter(file => {
      const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (!validTypes.includes(file.type)) {
        return false;
      }
      if (file.size > 5 * 1024 * 1024) { // 5MB
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) {
      setError(t('files.invalidFileType'));
      return;
    }

    try {
      setIsUploading(true);
      setError('');
      const result = await uploadFiles(validFiles, currentFolderId);

      if (result.files && result.files.length > 0) {
        setFiles(prev => [...prev, ...result.files]);
      }

      if (result.errors && result.errors.length > 0) {
        setError(result.errors.join(', '));
      }
    } catch (err) {
      console.error('Failed to upload files:', err);
      setError(t('files.uploadError'));
    } finally {
      setIsUploading(false);
    }
  };

  // Handle external file drag over upload area
  const handleUploadDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleUploadDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleUploadDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files);
    }
  };

  // Handle file input change
  const handleFileInputChange = (e) => {
    handleUpload(e.target.files);
    e.target.value = ''; // Reset input
  };

  // Delete file - show confirm modal with usage info
  const handleDeleteFile = async (file) => {
    setDeleteConfirm({ isOpen: true, file, message: '', isLoading: true });

    try {
      const usage = await getFileUsage(file.id);
      const games = usage.games || [];
      const message = games.length > 0
        ? t('files.confirmDeleteFileUsed', { games: games.join(', ') })
        : t('files.confirmDeleteFile');
      setDeleteConfirm(prev => ({ ...prev, message, isLoading: false }));
    } catch (err) {
      console.error('Failed to fetch file usage:', err);
      setDeleteConfirm(prev => ({ ...prev, message: t('files.confirmDeleteFile'), isLoading: false }));
    }
  };

  // Confirm actual deletion
  const handleConfirmDelete = async () => {
    const file = deleteConfirm.file;
    setDeleteConfirm(prev => ({ ...prev, isLoading: true }));

    try {
      await deleteFile(file.id);
      setFiles(prev => prev.filter(f => f.id !== file.id));
      setDeleteConfirm({ isOpen: false, file: null, message: '', isLoading: false });
    } catch (err) {
      console.error('Failed to delete file:', err);
      setError(t('files.deleteError'));
      setDeleteConfirm({ isOpen: false, file: null, message: '', isLoading: false });
    }
  };

  // Create folder
  const handleCreateFolder = async (e) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    try {
      const folder = await createFolder(newFolderName.trim(), currentFolderId);
      setFolders(prev => [...prev, folder]);
      setNewFolderName('');
      setIsCreateFolderOpen(false);
    } catch (err) {
      console.error('Failed to create folder:', err);
      setError(t('files.folderCreateError'));
    }
  };

  // Rename folder
  const handleRenameFolder = async (e) => {
    e.preventDefault();
    if (!renameValue.trim() || !renamingFolder) return;

    try {
      await renameFolder(renamingFolder.id, renameValue.trim());
      setFolders(prev => prev.map(f =>
        f.id === renamingFolder.id ? { ...f, name: renameValue.trim() } : f
      ));
      setRenamingFolder(null);
      setRenameValue('');
    } catch (err) {
      console.error('Failed to rename folder:', err);
      setError(t('files.folderRenameError'));
    }
  };

  // Delete folder
  const handleDeleteFolder = async (folder) => {
    const hasContents = files.some(f => f.folderId === folder.id) ||
                       folders.some(f => f.parentId === folder.id);

    const message = hasContents
      ? t('files.confirmDeleteFolderWithContents', { name: folder.name })
      : t('files.confirmDeleteFolder', { name: folder.name });

    if (!window.confirm(message)) {
      return;
    }

    try {
      await deleteFolder(folder.id, hasContents);
      setFolders(prev => prev.filter(f => f.id !== folder.id && f.parentId !== folder.id));
      if (hasContents) {
        setFiles(prev => prev.filter(f => f.folderId !== folder.id));
      }
    } catch (err) {
      console.error('Failed to delete folder:', err);
      setError(t('files.folderDeleteError'));
    }
  };

  // Start renaming a folder
  const startRenameFolder = (folder, e) => {
    e.stopPropagation();
    setRenamingFolder(folder);
    setRenameValue(folder.name);
  };

  // Render loading state
  if (isLoading) {
    return (
      <div className="files-tab files-tab--loading">
        <div className="loading-spinner" />
        <span>{t('common.loading')}</span>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="files-tab">
        {/* Header */}
        <div className="files-tab__header">
          <h3 className="files-tab__title">{t('files.title')}</h3>
          <div className="files-tab__actions">
            <button
              className="files-tab__btn"
              onClick={() => setIsCreateFolderOpen(true)}
            >
              + {t('files.createFolder')}
            </button>
          </div>
        </div>

        {/* Breadcrumb */}
        <div className="files-tab__breadcrumb">
          <span
            className="files-tab__breadcrumb-item files-tab__breadcrumb-item--clickable"
            onClick={() => navigateToBreadcrumb(-1)}
          >
            {t('files.root')}
          </span>
          {folderPath.map((folder, index) => (
            <React.Fragment key={folder.id}>
              <span className="files-tab__breadcrumb-separator">/</span>
              <span
                className="files-tab__breadcrumb-item files-tab__breadcrumb-item--clickable"
                onClick={() => navigateToBreadcrumb(index)}
              >
                {folder.name}
              </span>
            </React.Fragment>
          ))}
        </div>

        {/* Error message */}
        {error && (
          <div className="files-tab__error">
            <span>{error}</span>
            <button onClick={() => setError('')}>&times;</button>
          </div>
        )}

        {/* Upload area */}
        <div
          className={`files-tab__upload-area ${isDragOver ? 'files-tab__upload-area--drag-over' : ''} ${isUploading ? 'files-tab__upload-area--uploading' : ''}`}
          onDragOver={handleUploadDragOver}
          onDragLeave={handleUploadDragLeave}
          onDrop={handleUploadDrop}
          onClick={() => !isUploading && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.gif,.webp"
            onChange={handleFileInputChange}
            style={{ display: 'none' }}
          />
          {isUploading ? (
            <>
              <div className="loading-spinner" />
              <span>{t('files.uploading')}</span>
            </>
          ) : (
            <>
              <span className="files-tab__upload-icon">📁</span>
              <span>{t('files.dropOrClick')}</span>
              <span className="files-tab__upload-hint">{t('files.allowedFormats')}</span>
            </>
          )}
        </div>

        {/* File list */}
        <div className="files-tab__list">
          {/* Back button when in subfolder */}
          {currentFolderId && (
            <DroppableBackButton
              parentFolderId={parentFolderId}
              onNavigateUp={navigateUp}
            />
          )}

          {/* Folders */}
          {currentFolders.map(folder => (
            <DroppableFolderItem
              key={folder.id}
              folder={folder}
              onNavigate={navigateToFolder}
              onRename={startRenameFolder}
              onDelete={handleDeleteFolder}
              renamingFolder={renamingFolder}
              renameValue={renameValue}
              setRenameValue={setRenameValue}
              setRenamingFolder={setRenamingFolder}
              handleRenameFolder={handleRenameFolder}
              t={t}
            />
          ))}

          {/* Files */}
          {currentFiles.map(file => (
            <DraggableFileItem
              key={file.id}
              file={file}
              onPreview={setPreviewFile}
              onDelete={handleDeleteFile}
              onHover={setHoveredFile}
              onAddToScene={gameId && currentSceneId ? setAddToSceneFile : null}
              t={t}
            />
          ))}

          {/* Empty state */}
          {currentFolders.length === 0 && currentFiles.length === 0 && !currentFolderId && (
            <div className="files-tab__empty">
              <div className="empty-icon">📁</div>
              <p>{t('files.noFiles')}</p>
              <p className="empty-hint">{t('files.noFilesHint')}</p>
            </div>
          )}
        </div>

        {/* Create folder modal */}
        {isCreateFolderOpen && (
          <div className="files-tab__modal-overlay" onClick={() => setIsCreateFolderOpen(false)}>
            <div className="files-tab__modal" onClick={(e) => e.stopPropagation()}>
              <h4>{t('files.createFolder')}</h4>
              <form onSubmit={handleCreateFolder}>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder={t('files.folderNamePlaceholder')}
                  autoFocus
                />
                <div className="files-tab__modal-actions">
                  <button type="button" onClick={() => setIsCreateFolderOpen(false)}>
                    {t('common.cancel')}
                  </button>
                  <button type="submit" disabled={!newFolderName.trim()}>
                    {t('common.create')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Preview modal */}
        {previewFile && (
          <div className="files-tab__modal-overlay" onClick={() => setPreviewFile(null)}>
            <div className="files-tab__preview-modal" onClick={(e) => e.stopPropagation()}>
              <button className="files-tab__preview-close" onClick={() => setPreviewFile(null)}>
                &times;
              </button>
              <img src={getFileUrl(previewFile.fileUrl)} alt={previewFile.name} />
              <div className="files-tab__preview-info">
                <span className="files-tab__preview-name">{previewFile.name}</span>
                <span className="files-tab__preview-size">
                  {(previewFile.size / 1024).toFixed(1)} KB
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Hover preview - positioned to left of panel */}
        {hoveredFile && !draggingFile && (
          <div className="files-tab__hover-preview">
            <img
              src={getFileUrl(hoveredFile.fileUrl)}
              alt={hoveredFile.name}
            />
            <span className="files-tab__hover-preview-name">{hoveredFile.name}</span>
          </div>
        )}

        {/* Add to Scene dialog */}
        {addToSceneFile && (
          <div className="files-tab__modal-overlay" onClick={() => setAddToSceneFile(null)}>
            <div className="files-tab__modal" onClick={(e) => e.stopPropagation()}>
              <h4>{t('scenes.addToScene')}</h4>
              <p style={{ fontSize: 12, color: '#7a5c42', margin: '4px 0 8px' }}>
                {addToSceneFile.name}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#7a5c42' }}>
                  {t('scenes.layer')}
                </label>
                <select
                  value={addToSceneLayer}
                  onChange={(e) => setAddToSceneLayer(e.target.value)}
                  style={{
                    padding: '4px 8px', border: '1px solid #d4a574',
                    borderRadius: 3, background: '#faf3e8', fontSize: 12
                  }}
                >
                  <option value="background">{t('scenes.backgroundLayer')}</option>
                  <option value="gm">{t('scenes.gmLayer')}</option>
                </select>
              </div>
              <div className="files-tab__modal-actions">
                <button type="button" onClick={() => setAddToSceneFile(null)}>
                  {t('common.cancel')}
                </button>
                <button type="button" onClick={handleAddToScene}>
                  {t('scenes.addToScene')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      <ConfirmModal
        isOpen={deleteConfirm.isOpen}
        message={deleteConfirm.message}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false, file: null, message: '', isLoading: false })}
        confirmLabel={t('common.delete')}
        isLoading={deleteConfirm.isLoading}
      />

      {/* Drag overlay */}
      <DragOverlay dropAnimation={null}>
        {draggingFile && (
          <div className="files-tab__drag-overlay">
            <img
              src={getFileUrl(draggingFile.fileUrl)}
              alt={draggingFile.name}
              className="files-tab__drag-preview"
            />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
};

export default FilesTab;
