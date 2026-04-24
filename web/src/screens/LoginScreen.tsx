import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Container,
} from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { login, saveToken } from '../services/auth';

export default function LoginScreen() {
  const { setAccessToken } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState('');

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;
    
    setIsSubmitting(true);
    setError('');
    
    try {
      const tokens = await login(email.trim(), password);
      await saveToken(tokens.access, tokens.refresh);
      setAccessToken(tokens.access);
      navigate('/transactions');
    } catch (err: any) {
      const message =
        err?.response?.data?.detail ??
        err?.response?.data?.message ??
        err?.message ??
        'Failed to login.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          py: 4,
        }}
      >
        <Card
          sx={{
            width: '100%',
            maxWidth: 420,
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 3,
          }}
        >
          <CardContent sx={{ p: 4.5 }}>
            <Box sx={{ mb: 3.5 }}>
              <Typography
                variant="caption"
                component="div"
                sx={{
                  color: 'text.secondary',
                  letterSpacing: 1.5,
                  textTransform: 'uppercase',
                  mb: 0.75,
                }}
              >
                SplitApp
              </Typography>
              <Typography variant="h4" sx={{ mb: 1, fontWeight: 600 }}>
                Sign in
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ lineHeight: 1.4 }}
              >
                Use your email and password to continue.
              </Typography>
            </Box>

            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            <Box component="form" onSubmit={onLogin} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <TextField
                label="Email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
                disabled={isSubmitting}
                fullWidth
              />

              <TextField
                label="Password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                disabled={isSubmitting}
                fullWidth
              />

              <Button
                type="submit"
                variant="contained"
                disabled={isSubmitting}
                sx={{
                  py: 1.5,
                  bgcolor: 'text.primary',
                  '&:hover': {
                    bgcolor: 'text.primary',
                    opacity: 0.88,
                  },
                  '&:disabled': {
                    bgcolor: 'text.primary',
                    opacity: 0.6,
                  },
                }}
              >
                {isSubmitting ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                    <CircularProgress size={20} color="inherit" />
                    <span>Logging in…</span>
                  </Box>
                ) : (
                  'Login'
                )}
              </Button>
            </Box>

            <Box sx={{ mt: 3.5, textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary">
                Don't have an account?{' '}
                <Link
                  to="/register"
                  style={{
                    color: 'inherit',
                    textDecoration: 'underline',
                    fontWeight: 600,
                  }}
                >
                  Sign up
                </Link>
              </Typography>
            </Box>
          </CardContent>
        </Card>
      </Box>
    </Container>
  );
}
