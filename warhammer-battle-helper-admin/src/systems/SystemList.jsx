import React from "react";
import { List, Datagrid, TextField, FunctionField, EditButton } from "react-admin";
import Typography from "@mui/material/Typography";

function AccessLabel({ record }) {
  if (record.allUsers) return "All users";
  if (record.userIds.length > 0) return `${record.userIds.length} user(s)`;
  return (
    <Typography component="span" variant="body2" color="error">
      {record.configured ? "Nobody" : "Nobody (not configured)"}
    </Typography>
  );
}

export function SystemList() {
  return (
    <List pagination={false} sort={{ field: "id", order: "ASC" }}>
      <Datagrid bulkActionButtons={false}>
        <TextField source="id" label="System" />
        <FunctionField label="Access" render={(record) => <AccessLabel record={record} />} />
        <EditButton />
      </Datagrid>
    </List>
  );
}
