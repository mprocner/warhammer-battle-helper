import React from "react";
import {
  Edit,
  SimpleForm,
  TextField,
  BooleanInput,
  ReferenceArrayInput,
  AutocompleteArrayInput,
} from "react-admin";
import { useWatch } from "react-hook-form";
import Alert from "@mui/material/Alert";

// readOnly, not disabled: react-admin drops disabled values on submit, which would wipe the
// picked users whenever "All users" is on. Keeping them lets the admin flip back.
function UsersInput() {
  const allUsers = useWatch({ name: "allUsers" });
  const userIds = useWatch({ name: "userIds" }) || [];
  return (
    <>
      <ReferenceArrayInput source="userIds" reference="users" perPage={1000}>
        <AutocompleteArrayInput optionText="email" label="Selected users" readOnly={allUsers} fullWidth />
      </ReferenceArrayInput>
      {!allUsers && userIds.length === 0 && (
        <Alert severity="warning">Nobody can create games in this system.</Alert>
      )}
    </>
  );
}

export function SystemEdit() {
  return (
    <Edit mutationMode="pessimistic">
      <SimpleForm>
        <TextField source="id" label="System" />
        <BooleanInput source="allUsers" label="All users" />
        <UsersInput />
      </SimpleForm>
    </Edit>
  );
}
