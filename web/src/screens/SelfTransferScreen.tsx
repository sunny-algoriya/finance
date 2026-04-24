import React from 'react';
import { Box, Typography, Card, CardContent } from '@mui/material';

export default function SelfTransferScreen() {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 600 }}>
        Self Transfers
      </Typography>
      <Card>
        <CardContent>
          <Typography variant="body1">Self transfer management coming soon...</Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
