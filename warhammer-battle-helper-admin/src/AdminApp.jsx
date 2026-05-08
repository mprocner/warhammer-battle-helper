import React from "react";
import { Admin, Resource, CustomRoutes } from "react-admin";
import { Route } from "react-router-dom";
import PeopleIcon from "@mui/icons-material/People";
import SportsEsportsIcon from "@mui/icons-material/SportsEsports";
import StorageIcon from "@mui/icons-material/Storage";
import BarChartIcon from "@mui/icons-material/BarChart";

import authProvider from "./authProvider";
import dataProvider from "./dataProvider";
import { UserList } from "./users/UserList";
import { UserShow } from "./users/UserShow";
import { UserEdit } from "./users/UserEdit";
import { GameList } from "./games/GameList";
import { GameShow } from "./games/GameShow";
import StorageDashboard from "./stats/StorageDashboard";
import SessionAnalytics from "./stats/SessionAnalytics";

export default function AdminApp() {
  return (
    <Admin
      authProvider={authProvider}
      dataProvider={dataProvider}
      title="Battle Helper Admin"
    >
      <Resource
        name="users"
        icon={PeopleIcon}
        list={UserList}
        show={UserShow}
        edit={UserEdit}
        options={{ label: "Users" }}
      />
      <Resource
        name="games"
        icon={SportsEsportsIcon}
        list={GameList}
        show={GameShow}
        options={{ label: "Games" }}
      />
      <CustomRoutes>
        <Route path="/stats/storage" element={<StorageDashboard dataProvider={dataProvider} />} />
        <Route path="/stats/sessions" element={<SessionAnalytics dataProvider={dataProvider} />} />
      </CustomRoutes>
    </Admin>
  );
}
