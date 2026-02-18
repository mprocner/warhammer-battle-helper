import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import axiosInstance from '../../api/axios';
import { getAvatarUrl } from '../Avatar';

function AvatarUpload({ currentAvatar, onAvatarChange, disabled = false }) {
    const { t } = useTranslation();
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef(null);

    const handleClick = () => {
        if (!disabled && !isUploading) {
            fileInputRef.current?.click();
        }
    };

    const handleFileChange = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        // Validate file type
        const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!validTypes.includes(file.type)) {
            alert(t('characterSheet.invalidFileType'));
            return;
        }

        // Validate file size (5MB)
        if (file.size > 5 * 1024 * 1024) {
            alert(t('characterSheet.fileTooLarge'));
            return;
        }

        setIsUploading(true);
        try {
            const formData = new FormData();
            formData.append('avatar', file);

            const response = await axiosInstance.post('/avatars', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            onAvatarChange(response.data.url);
        } catch (error) {
            console.error('Avatar upload failed:', error);
            alert(t('characterSheet.avatarUploadFailed'));
        } finally {
            setIsUploading(false);
            // Reset the input so the same file can be selected again
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    return (
        <div
            className={`avatar-upload ${disabled ? 'disabled' : ''} ${isUploading ? 'uploading' : ''}`}
            onClick={handleClick}
        >
            <img
                key={currentAvatar || 'default'}
                src={getAvatarUrl(currentAvatar)}
                alt="Character Avatar"
                className="avatar-preview"
            />
            {isUploading && <div className="avatar-spinner" />}
            <div className="avatar-overlay">
                <span>{t('characterSheet.clickToChangeAvatar')}</span>
            </div>
            <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={handleFileChange}
                style={{ display: 'none' }}
            />
        </div>
    );
}

export default AvatarUpload;
