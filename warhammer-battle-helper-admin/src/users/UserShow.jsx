import React from "react";
import {
  Show,
  SimpleShowLayout,
  TextField,
  BooleanField,
  FunctionField,
  useRecordContext,
  useGetOne,
} from "react-admin";

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(1)} ${units[i]}`;
}

function formatDate(ts) {
  if (!ts) return "Never";
  return new Date(ts * 1000).toLocaleString();
}

function UserGames() {
  const record = useRecordContext();
  if (!record?.games?.length) return <p style={{ color: "#666" }}>No games</p>;

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
      <thead>
        <tr style={{ background: "#f5f5f5" }}>
          <th style={th}>Game</th>
          <th style={th}>Role</th>
          <th style={th}>Last seen</th>
        </tr>
      </thead>
      <tbody>
        {record.games.map((g) => (
          <tr key={g.gameId}>
            <td style={td}>{g.gameName}</td>
            <td style={td}>{g.role}</td>
            <td style={td}>{formatDate(g.lastSeen)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const th = { padding: "6px 12px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid #ddd" };
const td = { padding: "6px 12px", borderBottom: "1px solid #eee" };

export function UserShow() {
  return (
    <Show>
      <SimpleShowLayout>
        <TextField source="email" />
        <BooleanField source="active" label="Active" />
        <BooleanField source="isAdmin" label="Admin" />
        <FunctionField
          label="Files storage"
          render={(r) => `${formatBytes(r.filesBytes)} (${r.filesCount} files)`}
        />
        <FunctionField
          label="Music storage"
          render={(r) => `${formatBytes(r.musicBytes)} (${r.musicCount} tracks)`}
        />
        <FunctionField label="Games" render={() => <UserGames />} />
      </SimpleShowLayout>
    </Show>
  );
}
