import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ImageCropModal from '../../../components/common/ImageCropModal';
import { resolveFileUrl } from '../../../utils/fileUrl';
import { AFFORDANCE_ICON_SIZE } from './affordances';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// One picker for both image-bearing field types: char_avatar (round, square crop) and image
// (free crop, full field width). Uploading is the caller's job, through `upload(file)`, the same
// split ImageCropModal makes — so the sheet body never imports the HTTP client. With no
// `upload`/`onChange` the picker renders static and disabled: a read-only sheet and the template
// creator show the control, they just cannot use it.
function SheetImagePicker({ url, preset, variant, upload, onChange }) {
  const { t } = useTranslation();
  const inputRef = useRef(null);
  const [pickedFile, setPickedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  // null | 'type' (rejected before upload) | 'upload' (the request failed)
  const [error, setError] = useState(null);
  const enabled = Boolean(upload && onChange);
  const src = resolveFileUrl(url);

  const openPicker = () => {
    if (enabled && !isUploading) inputRef.current?.click();
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    // Reset so picking the same file again still fires onChange.
    e.target.value = '';
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('type');
      return;
    }
    setError(null);
    setPickedFile(file);
  };

  const confirmCrop = async (processed) => {
    setPickedFile(null);
    setIsUploading(true);
    try {
      onChange(await upload(processed));
      setError(null);
    } catch {
      setError('upload');
    } finally {
      setIsUploading(false);
    }
  };

  const className = `custom-sheet__image custom-sheet__image--${variant}`
    + (isUploading ? ' custom-sheet__image--uploading' : '');

  return (
    <div className={className}>
      {src ? (
        <img className="custom-sheet__image-img" src={src} alt="" />
      ) : (
        <button
          type="button"
          className="custom-sheet__image-empty"
          onClick={openPicker}
          disabled={!enabled}
          aria-label={t('customSheet.imageUpload')}
        >
          <AddPhotoAlternateIcon style={{ fontSize: 24 }} />
        </button>
      )}
      {src && enabled && !isUploading && (
        <div className="custom-sheet__image-actions">
          <button type="button" className="custom-sheet__image-btn" onClick={openPicker} aria-label={t('customSheet.imageChange')}>
            <EditIcon style={{ fontSize: AFFORDANCE_ICON_SIZE }} />
          </button>
          <button type="button" className="custom-sheet__image-btn" onClick={() => onChange('')} aria-label={t('customSheet.imageRemove')}>
            <DeleteIcon style={{ fontSize: AFFORDANCE_ICON_SIZE }} />
          </button>
        </div>
      )}
      {error && (
        <div className="custom-sheet__image-error">
          {t(error === 'type' ? 'customSheet.imageUnsupportedType' : 'customSheet.imageUploadFailed')}
        </div>
      )}
      {enabled && (
        <input ref={inputRef} type="file" accept={ACCEPTED_TYPES.join(',')} onChange={handleFile} hidden />
      )}
      {pickedFile && (
        <ImageCropModal file={pickedFile} preset={preset} onConfirm={confirmCrop} onCancel={() => setPickedFile(null)} />
      )}
    </div>
  );
}

export default SheetImagePicker;
