import React from 'react';
import { Box, Typography, Card, CardContent } from '@mui/material';

export default function PeoplesScreen() {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 600 }}>
        People
      </Typography>
      <Card>
        <CardContent>
          <Typography variant="body1">People management coming soon...</Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
