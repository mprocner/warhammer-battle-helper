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

function formatDuration(seconds) {
  if (!seconds) return "0m";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function SessionAnalytics({ dataProvider }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dataProvider.getSessionStats().then((data) => {
      setRows(data);
      setLoading(false);
    });
  }, [dataProvider]);

  const totalSeconds = rows.reduce((s, r) => s + (r.totalSeconds || 0), 0);
  const totalSessions = rows.reduce((s, r) => s + (r.sessionCount || 0), 0);

  return (
    <Card sx={{ mt: 2 }}>
      <Title title="Session Analytics" />
      <CardContent>
        <Typography variant="h6" gutterBottom>Top Games by Session Time</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Total play time: {formatDuration(totalSeconds)} across {totalSessions} sessions
        </Typography>
        {loading ? (
          <Typography>Loading…</Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>#</TableCell>
                <TableCell>Game</TableCell>
                <TableCell align="right">Total time</TableCell>
                <TableCell align="right">Sessions</TableCell>
                <TableCell align="right">Avg session</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow key={row.gameId}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell>{row.gameName || row.gameId}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                    {formatDuration(row.totalSeconds)}
                  </TableCell>
                  <TableCell align="right">{row.sessionCount}</TableCell>
                  <TableCell align="right">
                    {row.sessionCount ? formatDuration(Math.round(row.totalSeconds / row.sessionCount)) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
