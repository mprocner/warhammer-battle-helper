import React from "react";
import MuiAvatar from "@mui/material/Avatar";
import { getApiUrl } from "../api/axios";

// Helper to resolve avatar URL - prepends API base URL for backend-served avatars
export function getAvatarUrl(src) {
  if (!src) return null;
  // If the path starts with /avatars/, it's served by the backend
  if (src.startsWith("/avatars/")) {
    return getApiUrl() + src;
  }
  return src;
}

export default function Avatar({ src }) {
  const url = getAvatarUrl(src);
  if (url) {
    return <img className="avatar" src={url} alt="" />;
  }
  return <MuiAvatar className="avatar" sx={{ width: "100%", height: "100%" }} />;
}