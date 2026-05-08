import React from "react";
import { Edit, SimpleForm, BooleanInput, TextField } from "react-admin";

export function UserEdit() {
  return (
    <Edit>
      <SimpleForm>
        <TextField source="email" />
        <BooleanInput source="active" label="Account active" />
      </SimpleForm>
    </Edit>
  );
}
