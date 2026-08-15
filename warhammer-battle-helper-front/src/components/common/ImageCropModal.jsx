import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import Cropper from 'react-easy-crop';
import { processImage, resolveAspect, ImageProcessingError } from '../../utils/imageProcessing';
import './ImageCropModal.css';

const ERROR_KEYS = {
  'source-too-large': 'imageCrop.sourceTooLarge',
  'decode-failed': 'imageCrop.processingFailed',
  'encode-failed': 'imageCrop.processingFailed',
};

/**
 * Crop-and-downscale dialog shared by every single-image upload path.
 *
 * Deliberately does not upload anything — the four call sites hit four
 * different endpoints with different payloads, so they keep that part and
 * receive a ready File through onConfirm.
 */
const ImageCropModal = ({ file, preset, onConfirm, onCancel }) => {
  const { t } = useTranslation();
  const [imageSrc, setImageSrc] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [mediaAspect, setMediaAspect] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Keyed on `file` so a swapped file gets a fresh preview AND fresh crop state.
  // Without the resets, a call site that changes `file` without remounting would
  // keep the previous image's crop rectangle — and since croppedAreaPixels would
  // already be set, the confirm button would be enabled before the new image has
  // been cropped at all.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImageSrc(url);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setMediaAspect(null);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onCropComplete = useCallback((_area, areaPixels) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  // react-easy-crop reports the decoded image's real pixel size once it has
  // loaded it, which for a null-aspect preset is the ratio resolveAspect needs.
  // Until this fires, mediaAspect is null and resolveAspect falls back to 1 —
  // harmless, since componentDidUpdate recomputes the crop size the moment the
  // aspect prop changes.
  const onMediaLoaded = useCallback((mediaSize) => {
    setMediaAspect(mediaSize.naturalWidth / mediaSize.naturalHeight);
  }, []);

  const handleConfirm = async () => {
    setBusy(true);
    setError('');
    try {
      // onConfirm is awaited, not fired and forgotten: every call site uploads
      // inside it, and busy is what keeps Save and Cancel disabled. Without the
      // await they re-enable while the request is still in flight, and a second
      // click starts a second concurrent upload.
      await onConfirm(await processImage(file, preset, croppedAreaPixels));
    } catch (err) {
      const reason = err instanceof ImageProcessingError ? err.reason : null;
      setError(t(ERROR_KEYS[reason] || 'imageCrop.processingFailed'));
    } finally {
      setBusy(false);
    }
  };

  // Portaled to document.body: AvatarUpload's five mount points sit inside
  // popups that create their own stacking contexts (the character sheet
  // popup's inline z-index from WindowManagerContext, PlayerSettingsPopup's
  // 9999), which clamp this dialog's z-index regardless of its own value.
  // React events still bubble through the React tree, not the DOM tree, so
  // AvatarUpload's stopPropagation wrapper keeps working on the portaled node.
  return createPortal(
    <div className="image-crop-modal__overlay">
      <div className="image-crop-modal">
        <h4 className="image-crop-modal__title">{t('imageCrop.title')}</h4>
        <div className="image-crop-modal__area">
          {imageSrc && (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              // mediaAspect is already a naturalWidth/naturalHeight ratio (see
              // onMediaLoaded below), so it is fed through resolveAspect as a
              // width over a height of 1 — the division inside then returns
              // the ratio unchanged. mediaAspect stays null until layout, in
              // which case resolveAspect's own "no media size yet" guard falls
              // back to 1 rather than 0/1.
              aspect={resolveAspect(preset, mediaAspect ?? 0, 1)}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              onMediaLoaded={onMediaLoaded}
            />
          )}
        </div>
        <div className="image-crop-modal__zoom">
          <input
            type="range"
            min="1"
            max="3"
            step="0.05"
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="image-crop-modal__zoom-slider"
            aria-label={t('imageCrop.zoom')}
          />
        </div>
        {error && <div className="image-crop-modal__error">{error}</div>}
        <div className="image-crop-modal__actions">
          <button
            className="image-crop-modal__btn"
            onClick={onCancel}
            disabled={busy}
          >
            {t('common.cancel')}
          </button>
          <button
            className="image-crop-modal__btn image-crop-modal__btn--primary"
            onClick={handleConfirm}
            // Waiting for croppedAreaPixels is load-bearing, not cosmetic:
            // processImage passes a null crop area straight to
            // shouldPassthrough, which ignores preset.aspect. Confirming
            // before react-easy-crop reports an area would upload a
            // non-square avatar untouched.
            disabled={busy || !croppedAreaPixels}
          >
            {busy ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ImageCropModal;
