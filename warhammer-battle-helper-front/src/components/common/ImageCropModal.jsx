import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import Cropper from 'react-easy-crop';
import { processImage, ImageProcessingError } from '../../utils/imageProcessing';
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImageSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onCropComplete = useCallback((_area, areaPixels) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const handleConfirm = async () => {
    setBusy(true);
    setError('');
    try {
      onConfirm(await processImage(file, preset, croppedAreaPixels));
    } catch (err) {
      const reason = err instanceof ImageProcessingError ? err.reason : null;
      setError(t(ERROR_KEYS[reason] || 'imageCrop.processingFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="image-crop-modal__overlay">
      <div className="image-crop-modal">
        <h4 className="image-crop-modal__title">{t('imageCrop.title')}</h4>
        <div className="image-crop-modal__area">
          {imageSrc && (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={preset.aspect ?? undefined}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
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
    </div>
  );
};

export default ImageCropModal;
