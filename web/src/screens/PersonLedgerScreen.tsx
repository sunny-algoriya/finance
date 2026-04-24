import React from 'react';
import { useParams } from 'react-router-dom';
import { Box, Typography, Card, CardContent } from '@mui/material';

export default function PersonLedgerScreen() {
  const { personId } = useParams();

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 600 }}>
        Person Ledger - {personId}
      </Typography>
      <Card>
        <CardContent>
          <Typography variant="body1">Person ledger details coming soon...</Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
