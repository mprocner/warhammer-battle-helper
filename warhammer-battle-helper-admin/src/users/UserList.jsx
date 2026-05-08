import React from "react";
import {
  List,
  Datagrid,
  TextField,
  BooleanField,
  FunctionField,
  ShowButton,
  EditButton,
  DeleteButton,
  SearchInput,
  SelectInput,
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

const filters = [
  <SearchInput key="email" source="email" alwaysOn />,
  <SelectInput
    key="active"
    source="active"
    choices={[
      { id: "true", name: "Active" },
      { id: "false", name: "Inactive" },
    ]}
  />,
];

export function UserList() {
  return (
    <List filters={filters} sort={{ field: "email", order: "ASC" }}>
      <Datagrid bulkActionButtons={false}>
        <TextField source="email" />
        <BooleanField source="active" label="Active" />
        <BooleanField source="isAdmin" label="Admin" />
        <FunctionField
          label="Files"
          sortBy="filesBytes"
          render={(r) => `${formatBytes(r.filesBytes)} (${r.filesCount})`}
        />
        <FunctionField
          label="Music"
          sortBy="musicBytes"
          render={(r) => `${formatBytes(r.musicBytes)} (${r.musicCount})`}
        />
        <ShowButton />
        <EditButton />
        <DeleteButton />
      </Datagrid>
    </List>
  );
}
