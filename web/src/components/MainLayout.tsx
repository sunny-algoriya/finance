import React from "react";
import { Outlet } from "react-router-dom";
import { Box, Toolbar } from "@mui/material";

export default function MainLayout() {
  return (
    <Box sx={{ display: "flex", height: "100vh" }}>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: "100%",
          overflow: "auto",
          bgcolor: "background.default",
        }}
      >
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
}
