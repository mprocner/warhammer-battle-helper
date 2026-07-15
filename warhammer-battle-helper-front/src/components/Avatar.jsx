import React from "react";
import MuiAvatar from "@mui/material/Avatar";
import { resolveFileUrl } from "../utils/fileUrl";

// Adapter over resolveFileUrl: null (not '') on empty input, so callers using
// `if (url)` fall through to the MuiAvatar fallback below.
export function getAvatarUrl(src) {
  return resolveFileUrl(src) || null;
}

export default function Avatar({ src }) {
  const url = getAvatarUrl(src);
  if (url) {
    return <img className="avatar" src={url} alt="" />;
  }
  return <MuiAvatar className="avatar" sx={{ width: "100%", height: "100%" }} />;
}