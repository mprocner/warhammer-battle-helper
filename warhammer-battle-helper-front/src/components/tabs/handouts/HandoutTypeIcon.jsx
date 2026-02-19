import React from 'react';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import MailOutlinedIcon from '@mui/icons-material/MailOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import FindInPageOutlinedIcon from '@mui/icons-material/FindInPageOutlined';
import NewspaperOutlinedIcon from '@mui/icons-material/NewspaperOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';

const ICONS = {
  map: MapOutlinedIcon,
  letter: MailOutlinedIcon,
  document: DescriptionOutlinedIcon,
  image: ImageOutlinedIcon,
  clue: FindInPageOutlinedIcon,
  poster: NewspaperOutlinedIcon,
};

const HandoutTypeIcon = ({ type, className = '', fontSize = 20 }) => {
  const IconComponent = ICONS[type] || InsertDriveFileOutlinedIcon;

  return (
    <IconComponent
      className={className}
      sx={{ fontSize }}
    />
  );
};

export default HandoutTypeIcon;
