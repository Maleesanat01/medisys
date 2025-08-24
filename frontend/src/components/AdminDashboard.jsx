import { useState } from 'react'
import { post } from 'aws-amplify/api'
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  TextField,
  MenuItem,
  Alert,
  Snackbar,
  Grid,
  Paper,
  Chip
} from '@mui/material'
import { PersonAdd, AdminPanelSettings } from '@mui/icons-material'
import { fetchAuthSession } from 'aws-amplify/auth'

export default function AdminDashboard({ user, signOut }) {
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    role: '',
    clinic_id: ''
  })
  const [isCreating, setIsCreating] = useState(false)
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success'
  })
  const [tempPassword, setTempPassword] = useState('')

  const roles = [
    { value: 'lab', label: 'Laboratory Staff', description: 'Can upload diagnostic reports' },
    { value: 'healthcare', label: 'Healthcare Team', description: 'Can view reports and receive notifications' },
    { value: 'admin', label: 'Administrator', description: 'Can create users and manage system' }
  ]

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleCreateUser = async () => {
    // Validation
    if (!formData.email || !formData.name || !formData.role) {
      setSnackbar({
        open: true,
        message: 'Please fill in all required fields',
        severity: 'error'
      })
      return
    }

    if (formData.role === 'lab' && !formData.clinic_id) {
      setSnackbar({
        open: true,
        message: 'Clinic ID is required for laboratory staff',
        severity: 'error'
      })
      return
    }

    setIsCreating(true)
    
    try {
      // Get the JWT tokens from the authenticated session
      const { tokens } = await fetchAuthSession();
      
      
      const idToken = tokens.idToken.toString();

    
      console.log('Making request to API with data:', formData)
      console.log('ID token (first 50 chars):', idToken.substring(0, 50) + '...')
      
    
      try {
        const tokenPayload = JSON.parse(atob(idToken.split('.')[1]));
        console.log('Token payload:', tokenPayload);
        console.log('Groups in token:', tokenPayload['cognito:groups']);
      } catch (e) {
        console.log('Could not decode token for debugging:', e);
      }
      
      const response = await post({
        apiName: 'MedisysAPI',
        path: '/users',
        options: {
          body: formData,
          headers: {
            'Content-Type': 'application/json',
         
            'Authorization': `Bearer ${idToken}`
          }
        }
      }).response

      console.log('Response status:', response.status)
      console.log('Response headers:', response.headers)

      const result = await response.body.json()
      console.log('Response body:', result)
      
      // Check for success -
      const isSuccess = response.status === 200 || response.status === undefined && result.message && result.temporaryPassword
      
      if (isSuccess) {
        setTempPassword(result.temporaryPassword)
        setSnackbar({
          open: true,
          message: `User created successfully! Temporary password: ${result.temporaryPassword}`,
          severity: 'success'
        })
        
        // Reset form
        setFormData({
          email: '',
          name: '',
          role: '',
          clinic_id: ''
        })
      } else {
        // Only throw error if actually have an error
        if (result.error) {
          throw new Error(result.error)
        } else {
          throw new Error(`HTTP ${response.status || 'unknown'}: ${result.message || 'Failed to create user'}`)
        }
      }
      
    } catch (error) {
      console.error('Full error object:', error)
      console.error('Error creating user:', error)
      
      let errorMessage = 'Failed to create user'
      
      if (error.name === 'NetworkError') {
        errorMessage = 'Network error - please check your internet connection and try again'
      } else if (error.message) {
        errorMessage = error.message
      }
      
      setSnackbar({
        open: true,
        message: errorMessage,
        severity: 'error'
      })
    } finally {
      setIsCreating(false)
    }
  }

  const handleCloseSnackbar = () => {
    setSnackbar(prev => ({ ...prev, open: false }))
  }

  return (
    <Box sx={{ p: 4, maxWidth: 1200, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <AdminPanelSettings fontSize="large" color="primary" />
          <Typography variant="h4">MediSys Admin Dashboard</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Chip 
            label={`Admin: ${user.username}`} 
            color="primary" 
            variant="outlined" 
          />
          <Button onClick={signOut} variant="contained" color="secondary">
            Sign Out
          </Button>
        </Box>
      </Box>

      <Grid container spacing={4}>
        {/* Create User Form */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                <PersonAdd color="primary" />
                <Typography variant="h6">Create New User</Typography>
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <TextField
                  label="Email Address"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  required
                  fullWidth
                />

                <TextField
                  label="Full Name"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  required
                  fullWidth
                />

                <TextField
                  select
                  label="Role"
                  value={formData.role}
                  onChange={(e) => handleInputChange('role', e.target.value)}
                  required
                  fullWidth
                >
                  {roles.map((role) => (
                    <MenuItem key={role.value} value={role.value}>
                      <Box>
                        <Typography variant="body1">{role.label}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {role.description}
                        </Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </TextField>

                {formData.role === 'lab' && (
                  <TextField
                    label="Clinic ID"
                    value={formData.clinic_id}
                    onChange={(e) => handleInputChange('clinic_id', e.target.value)}
                    required
                    fullWidth
                    helperText="Unique identifier for the laboratory/clinic"
                  />
                )}

                <Button
                  variant="contained"
                  onClick={handleCreateUser}
                  disabled={isCreating}
                  size="large"
                  startIcon={<PersonAdd />}
                >
                  {isCreating ? 'Creating User...' : 'Create User'}
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Instructions */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                User Role Information
              </Typography>
              
              <Box sx={{ mt: 2 }}>
                {roles.map((role) => (
                  <Paper 
                    key={role.value} 
                    sx={{ p: 2, mb: 2, backgroundColor: 'grey.50' }}
                  >
                    <Typography variant="subtitle1" fontWeight="bold">
                      {role.label}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {role.description}
                    </Typography>
                    {role.value === 'lab' && (
                      <Typography variant="caption" sx={{ mt: 1, display: 'block' }}>
                        • Requires Clinic ID
                        • Can upload CSV/Excel reports
                        • Reports are automatically processed
                      </Typography>
                    )}
                    {role.value === 'healthcare' && (
                      <Typography variant="caption" sx={{ mt: 1, display: 'block' }}>
                        • Receives email notifications
                        • Can view all diagnostic reports
                        • Read-only access to patient data
                      </Typography>
                    )}
                  </Paper>
                ))}
              </Box>
            </CardContent>
          </Card>

          {tempPassword && (
            <Card sx={{ mt: 2, border: '2px solid', borderColor: 'success.main' }}>
              <CardContent>
                <Typography variant="h6" color="success.main" gutterBottom>
                  User Created Successfully!
                </Typography>
                <Typography variant="body1" gutterBottom>
                  Temporary Password:
                </Typography>
                <Typography 
                  variant="h6" 
                  sx={{ 
                    fontFamily: 'monospace', 
                    backgroundColor: 'grey.100', 
                    p: 1, 
                    borderRadius: 1,
                    wordBreak: 'break-all'
                  }}
                >
                  {tempPassword}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  Please share this password securely with the user. They will be required to change it on first login.
                </Typography>
              </CardContent>
            </Card>
          )}
        </Grid>
      </Grid>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={handleCloseSnackbar}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  )
}