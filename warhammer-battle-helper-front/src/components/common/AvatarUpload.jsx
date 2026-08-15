import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import MuiAvatar from '@mui/material/Avatar';
import axiosInstance from '../../api/axios';
import { getAvatarUrl } from '../Avatar';
import ImageCropModal from './ImageCropModal';
import { PRESETS } from '../../utils/imageProcessing';

function AvatarUpload({ currentAvatar, onAvatarChange, disabled = false }) {
    const { t } = useTranslation();
    const [isUploading, setIsUploading] = useState(false);
    const [pickedFile, setPickedFile] = useState(null);
    const fileInputRef = useRef(null);

    const handleClick = () => {
        if (!disabled && !isUploading) {
            fileInputRef.current?.click();
        }
    };

    const handleFileChange = (event) => {
        const file = event.target.files[0];
        // Reset the input so the same file can be selected again
        event.target.value = '';
        if (!file) return;

        const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!validTypes.includes(file.type)) {
            alert(t('characterSheet.invalidFileType'));
            return;
        }

        // Size is not checked here: the cropper downscales to 512px before
        // upload, so what the user picked is not what gets sent. processImage
        // rejects anything genuinely unprocessable.
        setPickedFile(file);
    };

    const uploadCropped = async (processed) => {
        setPickedFile(null);
        setIsUploading(true);
        try {
            const formData = new FormData();
            formData.append('avatar', processed, processed.name);

            const response = await axiosInstance.post('/avatars', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            onAvatarChange(response.data.url);
        } catch (error) {
            console.error('Avatar upload failed:', error);
            alert(t('characterSheet.avatarUploadFailed'));
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div
            className={`avatar-upload ${disabled ? 'disabled' : ''} ${isUploading ? 'uploading' : ''}`}
            onClick={handleClick}
        >
            {currentAvatar ? (
                <img
                    key={currentAvatar}
                    src={getAvatarUrl(currentAvatar)}
                    alt="Character Avatar"
                    className="avatar-preview"
                />
            ) : (
                <MuiAvatar sx={{ width: '100%', height: '100%', fontSize: '2.5rem' }} />
            )}
            {isUploading && <div className="avatar-spinner" />}
            <div className="avatar-overlay">
                <span>{t('characterSheet.clickToChangeAvatar')}</span>
            </div>
            <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                style={{ display: 'none' }}
            />
            {pickedFile && (
                <div onClick={(e) => e.stopPropagation()}>
                    <ImageCropModal
                        file={pickedFile}
                        preset={PRESETS.avatar}
                        onConfirm={uploadCropped}
                        onCancel={() => setPickedFile(null)}
                    />
                </div>
            )}
        </div>
    );
}

export default AvatarUpload;
