import React from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

// Full-size view of a landing screenshot. Open while `image` is set; Escape, a click on the
// backdrop or on the image itself closes it.
const LandingLightbox = ({ image, alt, onClose }) => {
    const { t } = useTranslation();

    return (
        <Dialog
            open={!!image}
            onClose={onClose}
            maxWidth={false}
            PaperProps={{
                sx: { position: 'relative', m: 2, background: 'transparent', boxShadow: 'none', overflow: 'visible' },
            }}
            slotProps={{ backdrop: { sx: { backgroundColor: 'rgba(20, 14, 8, 0.88)' } } }}
        >
            {image && (
                <>
                    <img className="landing__lightbox-image" src={image} alt={alt} onClick={onClose} />
                    <IconButton
                        onClick={onClose}
                        aria-label={t('common.close')}
                        sx={{
                            position: 'absolute',
                            top: 8,
                            right: 8,
                            color: '#f4e8d8',
                            backgroundColor: 'rgba(30, 22, 14, 0.7)',
                            '&:hover': { backgroundColor: 'rgba(30, 22, 14, 0.9)' },
                        }}
                    >
                        <CloseIcon />
                    </IconButton>
                </>
            )}
        </Dialog>
    );
};

export default LandingLightbox;
