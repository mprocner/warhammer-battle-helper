import React from "react";
import { getApiUrl } from "../api/axios";

// Helper to resolve avatar URL - prepends API base URL for backend-served avatars
export function getAvatarUrl(src) {
  if (!src) return "/img/avatar.png";
  // If the path starts with /avatars/, it's served by the backend
  if (src.startsWith("/avatars/")) {
    return getApiUrl() + src;
  }
  return src;
}

export default function Avatar({ src }) {
  return <img className="avatar" src={getAvatarUrl(src)} alt="" />;
}