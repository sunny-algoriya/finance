import React from 'react';
import { Box, Typography, Card, CardContent } from '@mui/material';

export default function SplitGroupsScreen() {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 600 }}>
        Split Groups
      </Typography>
      <Card>
        <CardContent>
          <Typography variant="body1">Split groups management coming soon...</Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
