import React, { useEffect, useState } from "react";
import { Title } from "react-admin";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TableSortLabel from "@mui/material/TableSortLabel";

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

export default function StorageDashboard({ dataProvider }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [orderBy, setOrderBy] = useState("totalBytes");
  const [order, setOrder] = useState("desc");

  useEffect(() => {
    dataProvider.getStorageStats().then((data) => {
      setRows(data);
      setLoading(false);
    });
  }, [dataProvider]);

  function handleSort(col) {
    if (orderBy === col) {
      setOrder(order === "asc" ? "desc" : "asc");
    } else {
      setOrderBy(col);
      setOrder("desc");
    }
  }

  const sorted = [...rows].sort((a, b) => {
    const dir = order === "asc" ? 1 : -1;
    return (a[orderBy] > b[orderBy] ? 1 : -1) * dir;
  });

  const totalFiles = rows.reduce((s, r) => s + (r.filesBytes || 0), 0);
  const totalMusic = rows.reduce((s, r) => s + (r.musicBytes || 0), 0);

  return (
    <Card sx={{ mt: 2 }}>
      <Title title="Storage Dashboard" />
      <CardContent>
        <Typography variant="h6" gutterBottom>Storage by User</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Total files: {formatBytes(totalFiles)} | Total music: {formatBytes(totalMusic)} | Grand total: {formatBytes(totalFiles + totalMusic)}
        </Typography>
        {loading ? (
          <Typography>Loading…</Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Email</TableCell>
                {[
                  { key: "filesBytes", label: "Files" },
                  { key: "musicBytes", label: "Music" },
                  { key: "totalBytes", label: "Total" },
                ].map((col) => (
                  <TableCell key={col.key} align="right">
                    <TableSortLabel
                      active={orderBy === col.key}
                      direction={orderBy === col.key ? order : "desc"}
                      onClick={() => handleSort(col.key)}
                    >
                      {col.label}
                    </TableSortLabel>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {sorted.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.email}</TableCell>
                  <TableCell align="right">{formatBytes(row.filesBytes)}</TableCell>
                  <TableCell align="right">{formatBytes(row.musicBytes)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{formatBytes(row.totalBytes)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
