import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { processImage, percentCropToSourceRect, ImageProcessingError } from '../../utils/imageProcessing';
import './ImageCropModal.css';

const ERROR_KEYS = {
  'source-too-large': 'imageCrop.sourceTooLarge',
  'decode-failed': 'imageCrop.processingFailed',
  'encode-failed': 'imageCrop.processingFailed',
};

const WHOLE_IMAGE_CROP = { unit: '%', x: 0, y: 0, width: 100, height: 100 };

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
  const [crop, setCrop] = useState(null);
  const [touched, setTouched] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [naturalSize, setNaturalSize] = useState(null);
  const [imgBox, setImgBox] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const imgRef = useRef(null);

  // Keyed on `file` so a swapped file gets a fresh preview AND fresh crop state.
  // Without the resets, a call site that changes `file` without remounting would
  // keep the previous image's frame and its touched flag, and could crop the new
  // image to the old bounds.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImageSrc(url);
    setCrop(null);
    setTouched(false);
    setZoom(1);
    setNaturalSize(null);
    setImgBox(null);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onImageLoad = useCallback((e) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    setNaturalSize({ width: naturalWidth, height: naturalHeight });
    // Rendered size at zoom 1 — the zoom frame multiplies this, it does not
    // recompute it, so it has to be read from the DOM once, here.
    const box = e.currentTarget.getBoundingClientRect();
    setImgBox({ width: box.width, height: box.height });
    setCrop(
      preset.aspect == null
        ? WHOLE_IMAGE_CROP
        : centerCrop(
            makeAspectCrop({ unit: '%', width: 100 }, preset.aspect, naturalWidth, naturalHeight),
            naturalWidth,
            naturalHeight
          )
    );
  }, [preset.aspect]);

  const handleConfirm = async () => {
    setBusy(true);
    setError('');
    try {
      // An untouched frame counts as "no crop" ONLY where the preset forces no
      // shape. For avatar and gameImage the opening frame is already a centred
      // crop, so skipping it would upload the whole, wrongly-shaped image — the
      // failure the previous library's confirm guard existed to prevent.
      const cropArea =
        preset.aspect == null && !touched
          ? null
          : percentCropToSourceRect(
              crop.x, crop.y, crop.width, crop.height,
              naturalSize.width, naturalSize.height
            );
      // onConfirm is awaited, not fired and forgotten: every call site uploads
      // inside it, and busy is what keeps Save and Cancel disabled. Without the
      // await they re-enable while the request is still in flight, and a second
      // click starts a second concurrent upload.
      await onConfirm(await processImage(file, preset, cropArea));
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
          <div
            className="image-crop-modal__zoom-frame"
            style={imgBox ? { width: imgBox.width * zoom, height: imgBox.height * zoom } : undefined}
          >
            <div
              className="image-crop-modal__scaler"
              style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
            >
              {imageSrc && (
                <ReactCrop
                  crop={crop ?? undefined}
                  onChange={(_pixelCrop, percentCrop) => {
                    setCrop(percentCrop);
                    setTouched(true);
                  }}
                  aspect={preset.aspect ?? undefined}
                  keepSelection
                >
                  <img
                    ref={imgRef}
                    src={imageSrc}
                    alt=""
                    className="image-crop-modal__image"
                    onLoad={onImageLoad}
                  />
                </ReactCrop>
              )}
            </div>
          </div>
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
            // Waiting for naturalSize is load-bearing: before the image loads
            // there is no intrinsic size, so no percentage can be converted to
            // source pixels and there is nothing meaningful to confirm.
            disabled={busy || !naturalSize}
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
