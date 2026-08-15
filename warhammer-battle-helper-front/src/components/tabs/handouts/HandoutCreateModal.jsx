import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { uploadHandoutFile } from '../../../api/handouts';
import { resolveFileUrl } from '../../../utils/fileUrl';
import HandoutTypeIcon from './HandoutTypeIcon';
import ModalHeader from '../../common/ModalHeader';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import ImageCropModal from '../../common/ImageCropModal';
import { PRESETS } from '../../../utils/imageProcessing';
import './HandoutCreateModal.css';

const HANDOUT_TYPES = ['map', 'letter', 'document', 'image', 'clue', 'poster'];

const ALLOWED_FILE_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'text/plain': '.txt'
};

// PDF and TXT skip the cropper — there is nothing to crop and nothing to downscale.
const CROPPABLE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Modal for creating or editing a handout (draggable, minimizable, no overlay)
 */
const HandoutCreateModal = ({
  isOpen,
  onClose,
  onSave,
  gameId,
  participants = [],
  editHandout = null // If provided, we're in edit mode
}) => {
  const { t } = useTranslation();
  const fileInputRef = useRef(null);
  const popupRef = useRef(null);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'image',
    visibility: ['gm-only'],
    fileUrl: ''
  });

  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [pickedFile, setPickedFile] = useState(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [position, setPosition] = useState({ x: Math.max(150, window.innerWidth / 2 - 250), y: 50 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Reset form when modal opens or edit handout changes
  useEffect(() => {
    if (isOpen) {
      if (editHandout) {
        setFormData({
          title: editHandout.title || '',
          description: editHandout.description || '',
          type: editHandout.type || 'image',
          visibility: editHandout.visibility || ['all'],
          fileUrl: editHandout.fileUrl || ''
        });
        setPreviewUrl(editHandout.fileUrl || '');
      } else {
        setFormData({
          title: '',
          description: '',
          type: 'image',
          visibility: ['gm-only'],
          fileUrl: ''
        });
        setPreviewUrl('');
      }
      setUploadError('');
      setIsMinimized(false);
      setPosition({ x: Math.max(150, window.innerWidth / 2 - 250), y: 50 });
    }
  }, [isOpen, editHandout]);

  // Drag handlers
  const handleMouseDown = (e) => {
    if (e.target.closest('.modal-header') && !e.target.closest('.modal-header__buttons')) {
      setIsDragging(true);
      const rect = popupRef.current.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    }
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  if (!isOpen) return null;

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleVisibilityChange = (value) => {
    if (value === 'all' || value === 'gm-only') {
      setFormData(prev => ({ ...prev, visibility: [value] }));
    } else {
      // Toggle player selection
      setFormData(prev => {
        const currentVis = prev.visibility.filter(v => v !== 'all' && v !== 'gm-only');
        if (currentVis.includes(value)) {
          const newVis = currentVis.filter(v => v !== value);
          return { ...prev, visibility: newVis.length > 0 ? newVis : ['gm-only'] };
        } else {
          return { ...prev, visibility: [...currentVis, value] };
        }
      });
    }
  };

  const uploadFile = async (file) => {
    setUploadError('');
    setIsUploading(true);

    try {
      const result = await uploadHandoutFile(gameId, file);
      setFormData(prev => ({ ...prev, fileUrl: result.url }));
      setPreviewUrl(result.url);
    } catch (error) {
      console.error('Upload failed:', error);
      setUploadError(t('handouts.uploadFailed'));
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (!file) return;

    if (!ALLOWED_FILE_TYPES[file.type]) {
      setUploadError(t('handouts.invalidFileType'));
      return;
    }

    if (CROPPABLE_TYPES.includes(file.type)) {
      setPickedFile(file);
      return;
    }

    uploadFile(file);
  };

  const handleCropConfirmed = (processed) => {
    setPickedFile(null);
    uploadFile(processed);
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      setUploadError(t('validation.required'));
      return;
    }

    if (!formData.fileUrl) {
      setUploadError(t('handouts.fileRequired'));
      return;
    }

    onSave(formData);
  };

  const isVisibilityAll = formData.visibility.includes('all');
  const isVisibilityGMOnly = formData.visibility.includes('gm-only');
  const isVisibilityPlayers = !isVisibilityAll && !isVisibilityGMOnly;

  // Filter out GM from participants for player selection
  const players = participants.filter(p => p.role !== 'gm');

  // Detect file type from URL extension for preview
  const getUploadedFileType = (url) => {
    if (!url) return null;
    const lower = url.toLowerCase().split('?')[0];
    if (lower.match(/\.(jpg|jpeg|png|gif|webp)$/)) return 'image';
    if (lower.match(/\.pdf$/)) return 'pdf';
    return 'text';
  };

  return (
    <>
    <div
      ref={popupRef}
      className={`handout-modal ${isMinimized ? 'handout-modal--minimized' : ''}`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
      onMouseDown={handleMouseDown}
    >
      <ModalHeader
        title={editHandout ? t('handouts.editHandout') : t('handouts.createHandout')}
        onClose={onClose}
        isMinimized={isMinimized}
        onToggleMinimize={() => setIsMinimized(v => !v)}
        isDragging={isDragging}
        draggable
        minimizeTitle={t('common.minimize')}
        expandTitle={t('common.expand')}
      />

      {!isMinimized && (
        <form onSubmit={handleSubmit} className="handout-modal__form">
          {/* Title */}
          <div className="handout-modal__field">
            <label htmlFor="title">{t('handouts.titleField')} *</label>
            <input
              type="text"
              id="title"
              name="title"
              value={formData.title}
              onChange={handleInputChange}
              placeholder={t('handouts.titlePlaceholder')}
              required
            />
          </div>

          {/* Description */}
          <div className="handout-modal__field">
            <label htmlFor="description">{t('handouts.description')}</label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              placeholder={t('handouts.descriptionPlaceholder')}
              rows={3}
            />
          </div>

          {/* Type */}
          <div className="handout-modal__field">
            <label>{t('handouts.type')}</label>
            <div className="handout-type-selector">
              {HANDOUT_TYPES.map(type => (
                <button
                  key={type}
                  type="button"
                  className={`type-btn ${formData.type === type ? 'type-btn--selected' : ''}`}
                  onClick={() => setFormData(prev => ({ ...prev, type }))}
                >
                  <HandoutTypeIcon type={type} />
                  <span>{t(`handouts.types.${type}`)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Visibility */}
          <div className="handout-modal__field">
            <label>{t('handouts.visibility')}</label>
            <div className="visibility-selector">
              <button
                type="button"
                className={`visibility-btn ${isVisibilityGMOnly ? 'visibility-btn--selected' : ''}`}
                onClick={() => handleVisibilityChange('gm-only')}
              >
                {t('handouts.gmOnly')}
              </button>
              <button
                type="button"
                className={`visibility-btn ${isVisibilityAll ? 'visibility-btn--selected' : ''}`}
                onClick={() => handleVisibilityChange('all')}
              >
                {t('handouts.visibleToAll')}
              </button>
              {players.length > 0 && (
                <button
                  type="button"
                  className={`visibility-btn ${isVisibilityPlayers ? 'visibility-btn--selected' : ''}`}
                  onClick={() => {
                    // Switch to player selection mode
                    if (!isVisibilityPlayers) {
                      setFormData(prev => ({ ...prev, visibility: [] }));
                    }
                  }}
                >
                  {t('handouts.selectPlayers')}
                </button>
              )}
            </div>

            {/* Player selection */}
            {isVisibilityPlayers && players.length > 0 && (
              <div className="player-selector">
                {players.map(player => (
                  <label key={player.userId} className="player-checkbox">
                    <input
                      type="checkbox"
                      checked={formData.visibility.includes(player.userId)}
                      onChange={() => handleVisibilityChange(player.userId)}
                    />
                    <span>{player.username}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* File Upload */}
          <div className="handout-modal__field">
            <label>{t('handouts.file')} *</label>
            <div className="file-upload-area">
              {previewUrl ? (
                <div className="file-preview">
                  {getUploadedFileType(previewUrl) === 'image' ? (
                    <img src={resolveFileUrl(previewUrl)} alt="Preview" className="file-preview__image" />
                  ) : getUploadedFileType(previewUrl) === 'pdf' ? (
                    <div className="file-preview__pdf">
                      <HandoutTypeIcon type="document" />
                      <span>{t('handouts.pdfUploaded')}</span>
                    </div>
                  ) : (
                    <div className="file-preview__text">
                      <HandoutTypeIcon type="letter" />
                      <span>{t('handouts.textUploaded')}</span>
                    </div>
                  )}
                  <button
                    type="button"
                    className="file-preview__change"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {t('handouts.changeFile')}
                  </button>
                </div>
              ) : (
                <div
                  className="file-upload-dropzone"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {isUploading ? (
                    <div className="upload-spinner" />
                  ) : (
                    <>
                      <UploadFileIcon className="upload-icon" />
                      <span>{t('handouts.clickToUpload')}</span>
                      <span className="upload-hint">{t('handouts.allowedFormats')}</span>
                    </>
                  )}
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.pdf,.txt"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
            </div>
          </div>

          {/* Error Message */}
          {uploadError && (
            <div className="handout-modal__error">{uploadError}</div>
          )}

          {/* Actions */}
          <div className="handout-modal__actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={isUploading || !formData.title || !formData.fileUrl}
            >
              {editHandout ? t('common.save') : t('common.create')}
            </button>
          </div>
        </form>
      )}
    </div>
    {pickedFile && (
      <ImageCropModal
        file={pickedFile}
        preset={PRESETS.handout}
        onConfirm={handleCropConfirmed}
        onCancel={() => setPickedFile(null)}
      />
    )}
    </>
  );
};

export default HandoutCreateModal;
