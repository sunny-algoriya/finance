import React from 'react';
import { Box, Typography, Card, CardContent } from '@mui/material';

export default function TransactionBrowseScreen() {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 600 }}>
        Browse Transactions
      </Typography>
      <Card>
        <CardContent>
          <Typography variant="body1">Transaction browsing and filtering coming soon...</Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
