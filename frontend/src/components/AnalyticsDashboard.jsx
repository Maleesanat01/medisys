import { useState, useEffect } from 'react'
import { get } from 'aws-amplify/api'
import { 
  Box, 
  Typography, 
  Paper, 
  Grid, 
  Card, 
  CardContent, 
  Chip,
  Alert,
  CircularProgress,
  Select,
  MenuItem,
  FormControl,
  InputLabel
} from '@mui/material'
import { 
  Analytics,
  TrendingUp,
  Person,
  LocalHospital,
  Science,
  Warning,
  Timeline,
  BarChart
} from '@mui/icons-material'
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  BarChart as RechartsBarChart,
  Bar,
  PieChart,
  Pie,
  Cell
} from 'recharts'
import { fetchAuthSession } from 'aws-amplify/auth'

export default function AnalyticsDashboard({ userRole, userAttributes }) {
  const [loading, setLoading] = useState(true)
  const [analytics, setAnalytics] = useState(null)
  const [timeRange, setTimeRange] = useState('30') // days
  const [error, setError] = useState(null)

  const fetchAnalytics = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const session = await fetchAuthSession()
      if (!session.tokens?.idToken) {
        throw new Error('No valid authentication token found')
      }

      const response = await get({ 
        apiName: 'MedisysAPI',
        path: `/analytics?timeRange=${timeRange}`,
        options: {
          headers: {
            Authorization: session.tokens.idToken.toString()
          }
        }
      }).response
      
      const data = await response.body.json()
      setAnalytics(data)
      
    } catch (err) {
      console.error('Error fetching analytics:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAnalytics()
  }, [timeRange])

  // Sample data if no data in backend
  const sampleAnalytics = {
    summary: {
      totalReports: 145,
      totalPatients: 89,
      criticalResults: 12,
      clinicsActive: 5
    },
    trendsData: [
      { date: '2025-01-01', reports: 5, critical: 1 },
      { date: '2025-01-02', reports: 8, critical: 0 },
      { date: '2025-01-03', reports: 12, critical: 2 },
      { date: '2025-01-04', reports: 7, critical: 1 },
      { date: '2025-01-05', reports: 15, critical: 3 },
      { date: '2025-01-06', reports: 10, critical: 1 },
      { date: '2025-01-07', reports: 18, critical: 2 }
    ],
    testTypesData: [
      { name: 'Blood Chemistry', value: 45, color: '#8884d8' },
      { name: 'Hematology', value: 32, color: '#82ca9d' },
      { name: 'Microbiology', value: 28, color: '#ffc658' },
      { name: 'Immunology', value: 25, color: '#ff7300' },
      { name: 'Other', value: 15, color: '#00ff00' }
    ],
    clinicData: [
      { clinic: 'Clinic A', reports: 45, critical: 5 },
      { clinic: 'Clinic B', reports: 32, critical: 3 },
      { clinic: 'Clinic C', reports: 28, critical: 2 },
      { clinic: 'Clinic D', reports: 25, critical: 1 },
      { clinic: 'Clinic E', reports: 15, critical: 1 }
    ],
    statusBreakdown: {
      normal: 108,
      abnormal: 25,
      critical: 12
    }
  }

  const displayData = analytics || sampleAnalytics

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Loading analytics...</Typography>
      </Box>
    )
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 3 }}>
        <Typography variant="body1">
          <strong>Error loading analytics:</strong> {error}
        </Typography>
      </Alert>
    )
  }

  return (
    <Box>
      {/* Header with Time Range Selector */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Analytics fontSize="large" color="primary" />
          <Typography variant="h5">Analytics Dashboard</Typography>
        </Box>
        
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Time Range</InputLabel>
          <Select
            value={timeRange}
            label="Time Range"
            onChange={(e) => setTimeRange(e.target.value)}
          >
            <MenuItem value="7">Last 7 days</MenuItem>
            <MenuItem value="30">Last 30 days</MenuItem>
            <MenuItem value="90">Last 90 days</MenuItem>
            <MenuItem value="365">Last year</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <BarChart color="primary" fontSize="large" />
                <Box>
                  <Typography variant="h4" color="primary">
                    {displayData.summary.totalReports}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Total Reports
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Person color="success" fontSize="large" />
                <Box>
                  <Typography variant="h4" color="success.main">
                    {displayData.summary.totalPatients}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Total Patients
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Warning color="error" fontSize="large" />
                <Box>
                  <Typography variant="h4" color="error.main">
                    {displayData.summary.criticalResults}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Critical Results
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <LocalHospital color="info" fontSize="large" />
                <Box>
                  <Typography variant="h4" color="info.main">
                    {displayData.summary.clinicsActive}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Active Clinics
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Charts Section */}
      <Grid container spacing={3}>
        {/* Reports Trend */}
        <Grid item xs={12} lg={8}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Timeline color="primary" />
              Reports Trend (Last {timeRange} days)
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={displayData.trendsData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(value) => new Date(value).toLocaleDateString()}
                />
                <YAxis />
                <Tooltip 
                  labelFormatter={(value) => new Date(value).toLocaleDateString()}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="reports" 
                  stroke="#1976d2" 
                  strokeWidth={2}
                  name="Total Reports"
                />
                <Line 
                  type="monotone" 
                  dataKey="critical" 
                  stroke="#d32f2f" 
                  strokeWidth={2}
                  name="Critical Results"
                />
              </LineChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Test Types Distribution */}
        <Grid item xs={12} lg={4}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Science color="primary" />
              Test Types Distribution
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={displayData.testTypesData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {displayData.testTypesData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Clinic Performance */}
        <Grid item xs={12} lg={8}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <LocalHospital color="primary" />
              Reports by Clinic
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <RechartsBarChart data={displayData.clinicData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="clinic" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="reports" fill="#1976d2" name="Total Reports" />
                <Bar dataKey="critical" fill="#d32f2f" name="Critical Results" />
              </RechartsBarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Status Summary */}
        <Grid item xs={12} lg={4}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Results Status Summary
            </Typography>
            <Box sx={{ mt: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="body2">Normal Results</Typography>
                <Chip 
                  label={displayData.statusBreakdown.normal} 
                  color="success" 
                  size="small"
                />
              </Box>
              
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="body2">Abnormal Results</Typography>
                <Chip 
                  label={displayData.statusBreakdown.abnormal} 
                  color="warning" 
                  size="small"
                />
              </Box>
              
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="body2">Critical Results</Typography>
                <Chip 
                  label={displayData.statusBreakdown.critical} 
                  color="error" 
                  size="small"
                />
              </Box>

              {/* Progress bars */}
              <Box sx={{ mt: 3 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Results Distribution
                </Typography>
                
                {/* Calculate percentages */}
                {(() => {
                  const total = displayData.statusBreakdown.normal + 
                               displayData.statusBreakdown.abnormal + 
                               displayData.statusBreakdown.critical
                  const normalPercent = (displayData.statusBreakdown.normal / total) * 100
                  const abnormalPercent = (displayData.statusBreakdown.abnormal / total) * 100
                  const criticalPercent = (displayData.statusBreakdown.critical / total) * 100
                  
                  return (
                    <Box sx={{ display: 'flex', height: 20, borderRadius: 1, overflow: 'hidden' }}>
                      <Box 
                        sx={{ 
                          width: `${normalPercent}%`, 
                          bgcolor: 'success.main',
                          minWidth: normalPercent > 5 ? 'auto' : '2px'
                        }} 
                      />
                      <Box 
                        sx={{ 
                          width: `${abnormalPercent}%`, 
                          bgcolor: 'warning.main',
                          minWidth: abnormalPercent > 5 ? 'auto' : '2px'
                        }} 
                      />
                      <Box 
                        sx={{ 
                          width: `${criticalPercent}%`, 
                          bgcolor: 'error.main',
                          minWidth: criticalPercent > 5 ? 'auto' : '2px'
                        }} 
                      />
                    </Box>
                  )
                })()}
              </Box>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  )
}