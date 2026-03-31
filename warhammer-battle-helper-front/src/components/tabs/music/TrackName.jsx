import React, { useRef } from 'react';
import PortalTooltip from './PortalTooltip';

const TrackName = ({ name }) => {
  const ref = useRef(null);
  return (
    <>
      <span className="music-tab__track-name" ref={ref}><span className="music-tab__truncate">{name}</span></span>
      <PortalTooltip text={name} targetRef={ref} />
    </>
  );
};

export default TrackName;
