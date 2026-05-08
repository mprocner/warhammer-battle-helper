import React from "react";
import {
  Show,
  SimpleShowLayout,
  TextField,
  DateField,
  FunctionField,
  useRecordContext,
} from "react-admin";

function formatDate(ts) {
  if (!ts) return "Never";
  return new Date(ts * 1000).toLocaleString();
}

function ParticipantsTable() {
  const record = useRecordContext();
  if (!record?.participants?.length) {
    return <p style={{ color: "#666" }}>No participants</p>;
  }
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
      <thead>
        <tr style={{ background: "#f5f5f5" }}>
          <th style={th}>Email</th>
          <th style={th}>Role</th>
          <th style={th}>Last seen in this game</th>
        </tr>
      </thead>
      <tbody>
        {record.participants.map((p) => (
          <tr key={p.userId}>
            <td style={td}>{p.email}</td>
            <td style={td}>{p.role}</td>
            <td style={td}>{formatDate(p.lastSeen)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const th = { padding: "6px 12px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid #ddd" };
const td = { padding: "6px 12px", borderBottom: "1px solid #eee" };

export function GameShow() {
  return (
    <Show>
      <SimpleShowLayout>
        <TextField source="name" />
        <TextField source="gameSystem" label="System" />
        <TextField source="status" />
        <DateField source="createdAt" label="Created" showTime />
        <FunctionField
          label="Deleted at"
          render={(r) => r.deletedAt ? new Date(r.deletedAt).toLocaleString() : "—"}
        />
        <FunctionField label="Participants" render={() => <ParticipantsTable />} />
      </SimpleShowLayout>
    </Show>
  );
}
