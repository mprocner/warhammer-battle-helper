import React from "react";
import {
  List,
  Datagrid,
  TextField,
  FunctionField,
  DateField,
  ShowButton,
  DeleteButton,
  SelectInput,
} from "react-admin";

const STATUS_COLORS = {
  active: "#2e7d32",
  paused: "#e65100",
  completed: "#546e7a",
};

const filters = [
  <SelectInput
    key="status"
    source="status"
    choices={[
      { id: "active", name: "Active" },
      { id: "paused", name: "Paused" },
      { id: "completed", name: "Completed" },
    ]}
  />,
  <SelectInput
    key="gameSystem"
    source="gameSystem"
    label="System"
    choices={[
      { id: "warhammer4e", name: "Warhammer 4e" },
      { id: "coc7e", name: "Call of Cthulhu 7e" },
    ]}
  />,
];

export function GameList() {
  return (
    <List filters={filters} sort={{ field: "createdAt", order: "DESC" }}>
      <Datagrid bulkActionButtons={false}>
        <TextField source="name" />
        <TextField source="gameSystem" label="System" />
        <FunctionField
          source="status"
          label="Status"
          render={(r) => (
            <span style={{ color: STATUS_COLORS[r.status] || "#000", fontWeight: 600 }}>
              {r.status}
            </span>
          )}
        />
        <FunctionField
          label="Participants"
          render={(r) => r.participantCount}
        />
        <DateField source="createdAt" label="Created" showTime />
        <FunctionField
          label="Deleted"
          render={(r) => r.deletedAt ? new Date(r.deletedAt).toLocaleDateString() : "—"}
        />
        <ShowButton />
        <DeleteButton />
      </Datagrid>
    </List>
  );
}
