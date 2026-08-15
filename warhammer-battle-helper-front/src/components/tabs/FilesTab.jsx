import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import CloseIcon from '@mui/icons-material/Close';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { getFiles, uploadFiles, deleteFile, getFileUsage, moveFile, renameFile, createFolder, renameFolder, deleteFolder } from '../../api/files';
import { addSceneImage } from '../../api/scenes';
import ConfirmModal from '../common/ConfirmModal';
import ImageCropModal from '../common/ImageCropModal';
import DraggableFileItem from './files/DraggableFileItem';
import DroppableFolderItem from './files/DroppableFolderItem';
import DroppableBackButton from './files/DroppableBackButton';
import { resolveFileUrl } from '../../utils/fileUrl';
import { processImage, PRESETS } from '../../utils/imageProcessing';
import './FilesTab.css';

const getImageDimensions = (url) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
  img.onerror = () => resolve({ width: 200, height: 200 });
  img.src = url;
});

const fitToScene = (imgW, imgH, sceneW, sceneH) => {
  if (imgW <= sceneW && imgH <= sceneH) return { width: imgW, height: imgH };
  const scale = Math.min(sceneW / imgW, sceneH / imgH);
  return { width: Math.round(imgW * scale), height: Math.round(imgH * scale) };
};

/**
 * Files tab - manages user's image files repository (GM only)
 */
const FilesTab = ({ token, gameId, currentSceneId, imageEditLayer = 'background' }) => {
  const { t } = useTranslation();
  const fileInputRef = useRef(null);

  const [files, setFiles] = useState([]);
  const [folders, setFolders] = useState([]);
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [folderPath, setFolderPath] = useState([]); // Breadcrumb path
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(null); // { current, total } while preprocessing
  const [isDragOver, setIsDragOver] = useState(false);
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [previewFile, setPreviewFile] = useState(null);
  const [renamingFolder, setRenamingFolder] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [renamingFile, setRenamingFile] = useState(null);
  const [renameFileValue, setRenameFileValue] = useState('');
  const [draggingFile, setDraggingFile] = useState(null);
  const [hoveredFile, setHoveredFile] = useState(null);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const [addToSceneFile, setAddToSceneFile] = useState(null);
  const [addToSceneLayer, setAddToSceneLayer] = useState('background');
  const [cropTarget, setCropTarget] = useState(null); // { file, source } — source is the fetched File
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, file: null, message: '', isLoading: false });

  useEffect(() => {
    if (!draggingFile) return;
    const track = (e) => { lastPointerRef.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener('pointermove', track);
    return () => window.removeEventListener('pointermove', track);
  }, [draggingFile]);

  const handleAddToScene = async () => {
    if (!addToSceneFile || !gameId || !currentSceneId) return;

    try {
      const sceneEl = document.querySelector('.scene-viewport__content');
      const sceneW = sceneEl ? sceneEl.offsetWidth : 1000;
      const sceneH = sceneEl ? sceneEl.offsetHeight : 1000;
      const { width: natW, height: natH } = await getImageDimensions(resolveFileUrl(addToSceneFile.fileUrl));
      const { width, height } = fitToScene(natW, natH, sceneW, sceneH);

      await addSceneImage(gameId, currentSceneId, {
        fileUrl: addToSceneFile.fileUrl,
        fileName: addToSceneFile.name,
        layer: addToSceneLayer,
        x: 0,
        y: 0,
        width,
        height,
      });
      setAddToSceneFile(null);
      setAddToSceneLayer('background');
    } catch (err) {
      console.error('Failed to add image to scene:', err);
      setError(t('scenes.addImageError'));
    }
  };

  // Cropping an existing library file writes a COPY. SceneImage references files
  // by fileUrl (not fileId), and one file can be used by scenes across several
  // games, so overwriting in place would mean rewriting every reference plus
  // cache-busting a UUID filename. The copy costs nothing on the backend — it's
  // an ordinary uploadFiles call with the same folderId.
  const handleCropFile = async (file) => {
    setError('');
    try {
      const res = await fetch(resolveFileUrl(file.fileUrl));
      // fetch only rejects on a network failure; a 404 for a server-side deleted
      // file resolves like any other response, and blob() would happily wrap the
      // error page. Without this the dialog opens on garbage the user cannot
      // confirm and cannot diagnose.
      if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
      const blob = await res.blob();
      setCropTarget({ file, source: new File([blob], file.name, { type: blob.type }) });
    } catch (err) {
      console.error('Failed to load file for cropping:', err);
      setError(t('files.cropLoadFailed'));
    }
  };

  const handleCropConfirmed = async (processed) => {
    const original = cropTarget.file;
    setCropTarget(null);
    setIsUploading(true);
    setError('');
    const problems = [];
    try {
      const base = original.name.replace(/\.[^.]+$/, '');
      // The extension comes from the processed file, not the original: a large
      // crop is re-encoded as .webp and a small one as .png, so the source
      // extension would be wrong more often than not.
      const ext = processed.name.slice(processed.name.lastIndexOf('.'));
      const named = new File(
        [processed],
        `${base} (${t('files.croppedSuffix')})${ext}`,
        { type: processed.type }
      );
      const result = await uploadFiles([named], currentFolderId);
      if (result.files && result.files.length > 0) {
        setFiles(prev => [...prev, ...result.files]);
      }
      if (result.errors && result.errors.length > 0) {
        problems.push(result.errors.join(', '));
      }
      setError(joinProblems(problems));
    } catch (err) {
      console.error('Failed to upload cropped file:', err);
      problems.push(t('files.uploadError'));
      setError(joinProblems(problems));
    } finally {
      setIsUploading(false);
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
      document.body.classList.add('files-dragging');
    }
  };

  // Handle drag end - move file to folder or drop onto scene
  const handleDragEnd = async (event) => {
    const { active, over } = event;
    setDraggingFile(null);
    document.body.classList.remove('files-dragging');

    // Scene drop: file dragged outside any folder drop zone
    if (!over && active.data.current?.type === 'file' && gameId && currentSceneId) {
      const file = active.data.current.file;
      const { x: dropX, y: dropY } = lastPointerRef.current;
      const sceneEl = document.querySelector('.scene-viewport__content');
      if (sceneEl) {
        const rect = sceneEl.getBoundingClientRect();
        if (dropX >= rect.left && dropX <= rect.right && dropY >= rect.top && dropY <= rect.bottom) {
          const zoom = rect.width / sceneEl.offsetWidth;
          try {
            const { width: natW, height: natH } = await getImageDimensions(resolveFileUrl(file.fileUrl));
            const { width, height } = fitToScene(natW, natH, sceneEl.offsetWidth, sceneEl.offsetHeight);
            const x = Math.max(0, (dropX - rect.left) / zoom - width / 2);
            const y = Math.max(0, (dropY - rect.top) / zoom - height / 2);
            await addSceneImage(gameId, currentSceneId, {
              fileUrl: file.fileUrl,
              fileName: file.name,
              layer: imageEditLayer,
              x, y, width, height,
            });
          } catch (err) {
            console.error('Failed to add image to scene:', err);
            setError(t('scenes.addImageError'));
          }
          return;
        }
      }
    }

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

  // Both the client-side processing loop and the server's per-file errors array
  // can fail parts of one batch. They used to each call setError, so whichever
  // landed second erased the other and the user only heard half the story.
  const joinProblems = (problems) => problems.join(' — ');

  // Handle file upload (from the picker or an external drag)
  const handleUpload = async (fileList) => {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const picked = Array.from(fileList).filter(file => validTypes.includes(file.type));

    if (picked.length === 0) {
      setError(t('files.invalidFileType'));
      return;
    }

    setIsUploading(true);
    setError('');

    // Serial, not Promise.all: decoding and redrawing a 4096px image costs
    // ~100ms of main thread, so twenty at once freeze the UI for seconds with
    // no feedback. Awaiting between files hands control back to the event loop
    // and lets the counter render.
    const prepared = [];
    const failed = [];
    const problems = [];
    for (let i = 0; i < picked.length; i++) {
      setProgress({ current: i + 1, total: picked.length });
      try {
        prepared.push(await processImage(picked[i], PRESETS.libraryImage));
      } catch {
        failed.push(picked[i].name);
      }
    }
    setProgress(null);

    if (failed.length > 0) {
      problems.push(t('files.processingFailed', { names: failed.join(', ') }));
    }

    if (prepared.length === 0) {
      setError(joinProblems(problems));
      setIsUploading(false);
      return;
    }

    try {
      const result = await uploadFiles(prepared, currentFolderId);

      if (result.files && result.files.length > 0) {
        setFiles(prev => [...prev, ...result.files]);
      }

      if (result.errors && result.errors.length > 0) {
        problems.push(result.errors.join(', '));
      }

      setError(joinProblems(problems));
    } catch (err) {
      console.error('Failed to upload files:', err);
      problems.push(t('files.uploadError'));
      setError(joinProblems(problems));
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

  // Start renaming a file
  const startRenameFile = (file, e) => {
    e.stopPropagation();
    setRenamingFile(file);
    setRenameFileValue(file.name);
  };

  // Confirm file rename
  const handleRenameFile = async (e) => {
    e.preventDefault();
    if (!renameFileValue.trim() || !renamingFile) return;
    const newName = renameFileValue.trim();
    const prevFile = renamingFile;
    setRenamingFile(null);
    setRenameFileValue('');
    try {
      await renameFile(prevFile.id, newName);
      setFiles(prev => prev.map(f => f.id === prevFile.id ? { ...f, name: newName } : f));
    } catch (err) {
      console.error('Failed to rename file:', err);
      setError(t('files.fileRenameError'));
    }
  };

  // Cancel file rename
  const cancelRenameFile = () => {
    setRenamingFile(null);
    setRenameFileValue('');
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

        {/* Error message */}
        {error && (
          <div className="files-tab__error">
            <span>{error}</span>
            <button onClick={() => setError('')}><CloseIcon fontSize="inherit" /></button>
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
            accept=".jpg,.jpeg,.png,.webp"
            onChange={handleFileInputChange}
            style={{ display: 'none' }}
          />
          {isUploading ? (
            <>
              <div className="loading-spinner" />
              <span>
                {progress
                  ? t('files.processing', { current: progress.current, total: progress.total })
                  : t('files.uploading')}
              </span>
            </>
          ) : (
            <>
              <span className="files-tab__upload-icon"><CloudUploadIcon fontSize="inherit" /></span>
              <span>{t('files.dropOrClick')}</span>
              <span className="files-tab__upload-hint">{t('files.allowedFormats')}</span>
            </>
          )}
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
              onAddToScene={gameId && currentSceneId ? (file) => { setAddToSceneFile(file); setAddToSceneLayer(imageEditLayer); } : null}
              onCrop={handleCropFile}
              onRename={startRenameFile}
              renamingFile={renamingFile}
              renameFileValue={renameFileValue}
              setRenameFileValue={setRenameFileValue}
              onConfirmRename={handleRenameFile}
              onCancelRename={cancelRenameFile}
            />
          ))}

          {/* Empty state */}
          {currentFolders.length === 0 && currentFiles.length === 0 && !currentFolderId && (
            <div className="files-tab__empty">
              <div className="empty-icon"><FolderOpenIcon fontSize="inherit" /></div>
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
                <CloseIcon fontSize="inherit" />
              </button>
              <img src={resolveFileUrl(previewFile.fileUrl)} alt={previewFile.name} />
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
              src={resolveFileUrl(hoveredFile.fileUrl)}
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
                  <option value="tokens">{t('scenes.tokensLayer')}</option>
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

      {cropTarget && (
        <ImageCropModal
          file={cropTarget.source}
          preset={PRESETS.libraryImage}
          onConfirm={handleCropConfirmed}
          onCancel={() => setCropTarget(null)}
        />
      )}

      {/* Drag overlay */}
      <DragOverlay dropAnimation={null}>
        {draggingFile && (
          <div className="files-tab__drag-overlay">
            <img
              src={resolveFileUrl(draggingFile.fileUrl)}
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
