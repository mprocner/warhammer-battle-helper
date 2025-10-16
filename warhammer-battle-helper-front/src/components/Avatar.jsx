import React from "react";

export default function Avatar({ src }) {
  return <img className="avatar" src={src ? src : "/img/avatar.png"} alt="" />;
}