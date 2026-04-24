import React from 'react';
import { Box, Typography, Card, CardContent } from '@mui/material';

export default function AccountsScreen() {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 600 }}>
        Accounts
      </Typography>
      <Card>
        <CardContent>
          <Typography variant="body1">Accounts management coming soon...</Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
