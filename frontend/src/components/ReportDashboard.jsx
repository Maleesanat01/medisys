import { useState, useEffect } from 'react'
import { get } from 'aws-amplify/api'
import { DataGrid } from '@mui/x-data-grid'
import { 
  Button, 
  Box, 
  Typography, 
  Card, 
  CardContent, 
  List, 
  ListItem, 
  ListItemText, 
  Chip,
  Alert,
  Divider,
  Paper,
  Badge,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tabs,
  Tab,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Tooltip
} from '@mui/material'
import { 
  Assessment, 
  Person, 
  LocalHospital, 
  AccessTime,
  Science,
  Warning,
  CheckCircle,
  Error as ErrorIcon,
  Close,
  PictureAsPdf,
  Analytics,
  TableChart,
  FilterList,
  Info,
  Security,
  Visibility
} from '@mui/icons-material'
import FileUpload from './FileUpload'
import NotificationCenter from './NotificationCenter'
import AnalyticsDashboard from './AnalyticsDashboard'
import { fetchUserAttributes, fetchAuthSession } from 'aws-amplify/auth'

// Tab Panel Component
function TabPanel({ children, value, index, ...other }) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`dashboard-tabpanel-${index}`}
      aria-labelledby={`dashboard-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ pt: 3 }}>
          {children}
        </Box>
      )}
    </div>
  )
}

export default function ReportDashboard({ user, signOut, userRole }) {
  const [reports, setReports] = useState([])
  const [selectedReport, setSelectedReport] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [userAttributes, setUserAttributes] = useState({})
  const [activeTab, setActiveTab] = useState(0)
  const [clinicFilter, setClinicFilter] = useState('') // For healthcare users to filter by clinic
  const [availableClinics, setAvailableClinics] = useState([]) // List of clinics for dropdown

  const fetchReports = async (clinicId = '') => {
    try {
      setLoading(true)
      
      // Get the current auth session
      const session = await fetchAuthSession()
      console.log('Auth session:', session)
      
      if (!session.tokens?.idToken) {
        throw new Error('No valid authentication token found')
      }

      // Build query parameters
      const queryParams = new URLSearchParams()
      if (clinicId && userRole === 'healthcare') {
        queryParams.append('clinic_id', clinicId)
      }
      
      const queryString = queryParams.toString()
      const path = `/reports${queryString ? `?${queryString}` : ''}`

      const response = await get({ 
        apiName: 'MedisysAPI',
        path: path,
        options: {
          headers: {
            Authorization: session.tokens.idToken.toString()
          }
        }
      }).response
      
      const data = await response.body.json()
      console.log('Fetched reports:', data)
      
      setReports(data)
      
      // Extract unique clinics for healthcare users
      if (userRole === 'healthcare' || userRole === 'admin') {
        const clinics = [...new Set(data.map(report => report.clinic_id).filter(Boolean))]
        setAvailableClinics(clinics.sort())
      }
      
    } catch (err) {
      console.error('Error fetching reports:', err)
     
      if (err.response) {
        console.error('Error response:', await err.response.body.text())
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { 
    fetchReports(clinicFilter)
    
    // Get user attributes
    const getUserAttributes = async () => {
      try {
        const attributes = await fetchUserAttributes()
        setUserAttributes(attributes)
      } catch (error) {
        console.error('Error fetching user attributes:', error)
      }
    }
    getUserAttributes()
  }, [clinicFilter])

  // Helper function to get status color and icon
  const getTestStatusInfo = (test) => {
    const status = test.status?.toLowerCase() || 'unknown'
    const isCritical = test.critical_flag === 'Y'
    
    if (isCritical) {
      return { color: 'error', icon: <ErrorIcon fontSize="small" />, label: 'Critical' }
    }
    
    switch (status) {
      case 'high':
        return { color: 'warning', icon: <Warning fontSize="small" />, label: 'High' }
      case 'low':
        return { color: 'warning', icon: <Warning fontSize="small" />, label: 'Low' }
      case 'abnormal':
        return { color: 'warning', icon: <Warning fontSize="small" />, label: 'Abnormal' }
      case 'normal':
        return { color: 'success', icon: <CheckCircle fontSize="small" />, label: 'Normal' }
      default:
        return { color: 'default', icon: null, label: status || 'Unknown' }
    }
  }

  // count critical tests for each report
  const getAbnormalTestCount = (testResults) => {
    if (!testResults || !Array.isArray(testResults)) return 0
    return testResults.filter(test => {
      const status = test.status?.toLowerCase()
      return test.critical_flag === 'Y' || 
             status === 'high' || 
             status === 'low' || 
             status === 'abnormal'
    }).length
  }

  // view report details 
  const handleViewDetails = (report) => {
    setSelectedReport(report)
    setModalOpen(true)
  }

 
  const handleCloseModal = () => {
    setModalOpen(false)
    setSelectedReport(null)
  }


  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue)
  }


  const handleClinicFilterChange = (event) => {
    setClinicFilter(event.target.value)
  }

  // Handle PDF download
  const handleDownloadPDF = () => {
    if (!selectedReport) return

    // Create a new window/tab for printing
    const printWindow = window.open('', '_blank')
    
    // Generate HTML content for PDF
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Medical Report - ${selectedReport.patient_name}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 20px;
            color: #333;
          }
          .header {
            text-align: center;
            border-bottom: 2px solid #1976d2;
            padding-bottom: 20px;
            margin-bottom: 30px;
          }
          .section {
            margin-bottom: 25px;
          }
          .section-title {
            font-size: 18px;
            font-weight: bold;
            color: #1976d2;
            margin-bottom: 10px;
            border-bottom: 1px solid #e0e0e0;
            padding-bottom: 5px;
          }
          .info-row {
            margin-bottom: 8px;
          }
          .label {
            font-weight: bold;
            display: inline-block;
            width: 120px;
          }
          .test-item {
            margin-bottom: 15px;
            padding: 10px;
            border: 1px solid #e0e0e0;
            border-radius: 4px;
          }
          .test-name {
            font-weight: bold;
            font-size: 16px;
            margin-bottom: 5px;
          }
          .test-result {
            margin-bottom: 3px;
          }
          .status-critical {
            color: #d32f2f;
            font-weight: bold;
          }
          .status-warning {
            color: #f57c00;
            font-weight: bold;
          }
          .status-normal {
            color: #388e3c;
            font-weight: bold;
          }
          .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e0e0e0;
            font-size: 12px;
            color: #666;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>MediSys Diagnostics Report</h1>
          <p>Generated on ${new Date().toLocaleString()}</p>
        </div>

        <div class="section">
          <div class="section-title">Patient Information</div>
          <div class="info-row"><span class="label">Name:</span> ${selectedReport.patient_name}</div>
          <div class="info-row"><span class="label">Patient ID:</span> ${selectedReport.patient_id}</div>
          <div class="info-row"><span class="label">Clinic:</span> ${selectedReport.clinic_id}</div>
          ${selectedReport.patient_info?.patient_dob ? `<div class="info-row"><span class="label">DOB:</span> ${selectedReport.patient_info.patient_dob}</div>` : ''}
          ${selectedReport.patient_info?.patient_gender ? `<div class="info-row"><span class="label">Gender:</span> ${selectedReport.patient_info.patient_gender}</div>` : ''}
          ${selectedReport.patient_info?.ordering_physician ? `<div class="info-row"><span class="label">Physician:</span> ${selectedReport.patient_info.ordering_physician}</div>` : ''}
          ${selectedReport.patient_info?.test_date ? `<div class="info-row"><span class="label">Test Date:</span> ${selectedReport.patient_info.test_date}</div>` : ''}
          <div class="info-row"><span class="label">Report Date:</span> ${new Date(selectedReport.timestamp).toLocaleString()}</div>
        </div>

        <div class="section">
          <div class="section-title">Test Results (${selectedReport.test_results?.length || 0} tests)</div>
          ${selectedReport.test_results?.map(test => {
            const statusInfo = getTestStatusInfo(test)
            const statusClass = test.critical_flag === 'Y' ? 'status-critical' : 
                               statusInfo.color === 'warning' ? 'status-warning' : 
                               statusInfo.color === 'success' ? 'status-normal' : ''
            
            return `
              <div class="test-item">
                <div class="test-name">${test.test_name}</div>
                <div class="test-result"><span class="label">Result:</span> ${formatTestResult(test)}</div>
                ${test.test_type ? `<div class="test-result"><span class="label">Type:</span> ${test.test_type}</div>` : ''}
                <div class="test-result"><span class="label">Status:</span> <span class="${statusClass}">${statusInfo.label}</span></div>
              </div>
            `
          }).join('') || '<p>No test results available</p>'}
        </div>

        <div class="section">
          <div class="section-title">Notes & Remarks</div>
          <p>${selectedReport.remarks || 'No remarks provided'}</p>
        </div>

        <div class="footer">
          <div><strong>Report ID:</strong> ${selectedReport.report_id}</div>
          <div><strong>Source:</strong> ${selectedReport.source === 'ui_upload' ? 'Web Upload' : 'CLI Upload'}</div>
          <div><strong>Processed:</strong> ${new Date(selectedReport.processing_time).toLocaleString()}</div>
        </div>
      </body>
      </html>
    `

    // Write content to new window and trigger print
    printWindow.document.write(htmlContent)
    printWindow.document.close()
    
    // Wait for content to load, then trigger print dialog
    setTimeout(() => {
      printWindow.print()
      // Close the window after printing 
      printWindow.onafterprint = () => printWindow.close()
    }, 500)
  }

  const columns = [
    { 
      field: 'report_id', 
      headerName: 'Report ID', 
      width: 180,
      renderCell: (params) => (
        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
          {params.value?.substring(0, 8)}...
        </Typography>
      )
    },
    { 
      field: 'patient_name', 
      headerName: 'Patient Name', 
      width: 180,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Person fontSize="small" color="primary" />
          <Typography variant="body2">{params.value}</Typography>
        </Box>
      )
    },
    { 
      field: 'patient_id', 
      headerName: 'Patient ID', 
      width: 120,
      renderCell: (params) => (
        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
          {params.value}
        </Typography>
      )
    },
    { 
      field: 'clinic_id', 
      headerName: 'Clinic', 
      width: 120,
      renderCell: (params) => (
        <Chip 
          label={params.value} 
          size="small" 
          variant="outlined"
          icon={<LocalHospital fontSize="small" />}
          color={userRole === 'lab' && params.value === userAttributes['custom:clinic_id'] ? 'primary' : 'default'}
        />
      )
    },
    { 
      field: 'test_results', 
      headerName: 'Tests', 
      width: 100,
      renderCell: (params) => {
        const totalTests = params.value?.length || 0
        const abnormalCount = getAbnormalTestCount(params.value)
        
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2">
              {totalTests}
            </Typography>
            {abnormalCount > 0 && (
              <Badge badgeContent={abnormalCount} color="error">
                <Warning fontSize="small" color="warning" />
              </Badge>
            )}
          </Box>
        )
      }
    },
    { 
      field: 'timestamp', 
      headerName: 'Date', 
      width: 180,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AccessTime fontSize="small" color="action" />
          <Typography variant="body2">
            {new Date(params.value).toLocaleString()}
          </Typography>
        </Box>
      )
    },
    { 
      field: 'status',
      headerName: 'Status',
      width: 100,
      renderCell: (params) => (
        <Chip 
          label={params.value || 'Processed'} 
          size="small"
          color="success"
          variant="filled"
        />
      )
    },
    { 
      field: 'actions', 
      headerName: 'Actions', 
      width: 150,
      renderCell: (params) => (
        <Button 
          variant="outlined" 
          size="small"
          onClick={() => handleViewDetails(params.row)}
          startIcon={<Assessment />}
        >
          View Details
        </Button>
      )
    }
  ]

  const formatTestResult = (test) => {
    const value = test.result
    const unit = test.unit
    const range = test.reference_range
    
    return `${value}${unit ? ` ${unit}` : ''}${range ? ` (Ref: ${range})` : ''}`
  }

  // Get access info based on role
  const getAccessInfo = () => {
    switch (userRole) {
      case 'lab':
        return {
          icon: <Security color="primary" />,
          title: 'Laboratory Access',
          description: `You can only view reports uploaded by your clinic (${userAttributes['custom:clinic_id'] || 'Unknown'})`,
          color: 'primary'
        }
      case 'healthcare':
        return {
          icon: <Visibility color="success" />,
          title: 'Healthcare Access',
          description: 'You can view reports from all clinics and laboratories',
          color: 'success'
        }
      case 'admin':
        return {
          icon: <Visibility color="warning" />,
          title: 'Administrator Access',
          description: 'You have full access to all reports and system functions',
          color: 'warning'
        }
      default:
        return {
          icon: <Info />,
          title: 'Limited Access',
          description: 'Your access permissions are not configured',
          color: 'default'
        }
    }
  }

  const accessInfo = getAccessInfo()

  return (
    <Box sx={{ p: 4 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Assessment fontSize="large" color="primary" />
          <Typography variant="h4">MediSys Diagnostics Portal</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {/* Notification Center - only shows for healthcare users */}
          <NotificationCenter userRole={userRole} />
          
          <Chip 
            label={`${userRole}: ${user.username}`} 
            color="primary"
            variant="outlined"
          />
          {userAttributes['custom:clinic_id'] && (
            <Chip 
              label={`Clinic: ${userAttributes['custom:clinic_id']}`}
              color="secondary"
              variant="outlined"
            />
          )}
          <Button onClick={signOut} variant="contained">
            Sign Out
          </Button>
        </Box>
      </Box>

      {/* Access Information Alert */}
      <Alert 
        severity="info" 
        sx={{ mb: 3 }} 
        icon={accessInfo.icon}
      >
        <Typography variant="body1">
          <strong>{accessInfo.title}:</strong> {accessInfo.description}
        </Typography>
        {userRole === 'lab' && (
          <Typography variant="body2" sx={{ mt: 1 }}>
            Upload MediSys diagnostic CSV files using the form below. Each patient's test results will be processed separately.
          </Typography>
        )}
      </Alert>

      {/* Navigation Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs 
          value={activeTab} 
          onChange={handleTabChange} 
          indicatorColor="primary"
          textColor="primary"
        >
          <Tab 
            icon={<TableChart />} 
            label={`Reports (${reports.length})`}
            iconPosition="start"
            sx={{ minHeight: 64 }}
          />
          <Tab 
            icon={<Analytics />} 
            label="Analytics" 
            iconPosition="start"
            sx={{ minHeight: 64 }}
          />
        </Tabs>
      </Paper>

      {/* Tab Panels */}
      <TabPanel value={activeTab} index={0}>
        
        {userRole === 'lab' && (
          <Box sx={{ mb: 4 }}>
            <FileUpload onSuccess={fetchReports} userRole={userRole} />
          </Box>
        )}

        {/* Clinic Filter for Healthcare Users */}
        {(userRole === 'healthcare' || userRole === 'admin') && availableClinics.length > 0 && (
          <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
            <FilterList color="action" />
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>Filter by Clinic</InputLabel>
              <Select
                value={clinicFilter}
                label="Filter by Clinic"
                onChange={handleClinicFilterChange}
              >
                <MenuItem value="">
                  <em>All Clinics</em>
                </MenuItem>
                {availableClinics.map(clinic => (
                  <MenuItem key={clinic} value={clinic}>
                    {clinic}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {clinicFilter && (
              <Tooltip title="Clear filter">
                <IconButton 
                  size="small" 
                  onClick={() => setClinicFilter('')}
                >
                  <Close fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        )}

        {/* Reports Table */}
        <Paper sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', justify: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Assessment color="primary" />
              Diagnostic Reports ({reports.length})
              {clinicFilter && (
                <Chip 
                  label={`Filtered by: ${clinicFilter}`}
                  size="small"
                  color="primary"
                  variant="outlined"
                />
              )}
            </Typography>
            {userRole === 'lab' && (
              <Typography variant="caption" color="text.secondary">
                Showing reports from your clinic only
              </Typography>
            )}
          </Box>
          <DataGrid
            rows={reports}
            columns={columns}
            initialState={{
              pagination: {
                paginationModel: { page: 0, pageSize: 10 }
              },
              sorting: {
                sortModel: [{ field: 'timestamp', sort: 'desc' }]
              }
            }}
            pageSizeOptions={[10, 25, 50]}
            getRowId={(row) => row.report_id}
            loading={loading}
            sx={{ 
              height: 600,
              '& .MuiDataGrid-row:hover': {
                backgroundColor: 'action.hover'
              }
            }}
            disableRowSelectionOnClick
          />
        </Paper>
      </TabPanel>

      <TabPanel value={activeTab} index={1}>
        {/* Analytics Dashboard */}
        <AnalyticsDashboard 
          userRole={userRole} 
          userAttributes={userAttributes}
        />
      </TabPanel>

      {/* Report Details Modal */}
      <Dialog
        open={modalOpen}
        onClose={handleCloseModal}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: { 
            borderRadius: 2,
            maxHeight: '90vh'
          }
        }}
      >
        <DialogTitle sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          pb: 1
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Assessment color="primary" />
            <Typography variant="h6">Report Details</Typography>
          </Box>
          <IconButton onClick={handleCloseModal} size="small">
            <Close />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers sx={{ p: 3 }}>
          {selectedReport && (
            <>
              {/* Patient Information */}
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Person color="primary" />
                  Patient Information
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  <strong>Name:</strong> {selectedReport.patient_name}
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  <strong>ID:</strong> {selectedReport.patient_id}
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  <strong>Clinic:</strong> {selectedReport.clinic_id}
                </Typography>
                
                {/* additional patient info from MediSys format */}
                {selectedReport.patient_info && (
                  <>
                    {selectedReport.patient_info.patient_dob && (
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        <strong>DOB:</strong> {selectedReport.patient_info.patient_dob}
                      </Typography>
                    )}
                    {selectedReport.patient_info.patient_gender && (
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        <strong>Gender:</strong> {selectedReport.patient_info.patient_gender}
                      </Typography>
                    )}
                    {selectedReport.patient_info.ordering_physician && (
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        <strong>Physician:</strong> {selectedReport.patient_info.ordering_physician}
                      </Typography>
                    )}
                    {selectedReport.patient_info.test_date && (
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        <strong>Test Date:</strong> {selectedReport.patient_info.test_date}
                      </Typography>
                    )}
                  </>
                )}
                
                <Typography variant="body2" color="text.secondary">
                  <strong>Report Date:</strong> {new Date(selectedReport.timestamp).toLocaleString()}
                </Typography>
              </Box>

              <Divider sx={{ mb: 2 }} />
              
              {/* Test Results */}
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Science color="primary" />
                  Test Results ({selectedReport.test_results?.length || 0})
                  {getAbnormalTestCount(selectedReport.test_results) > 0 && (
                    <Badge badgeContent={getAbnormalTestCount(selectedReport.test_results)} color="error">
                      <Warning fontSize="small" color="warning" />
                    </Badge>
                  )}
                </Typography>
                
                {selectedReport.test_results && selectedReport.test_results.length > 0 ? (
                  <List dense sx={{ maxHeight: 300, overflow: 'auto' }}>
                    {selectedReport.test_results.map((test, index) => {
                      const statusInfo = getTestStatusInfo(test)
                      return (
                        <ListItem key={index} sx={{ px: 0, py: 1 }}>
                          <ListItemText
                            primary={
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Typography variant="body2" fontWeight="medium">
                                  {test.test_name}
                                </Typography>
                                <Chip
                                  size="small"
                                  label={statusInfo.label}
                                  color={statusInfo.color}
                                  icon={statusInfo.icon}
                                  variant={test.critical_flag === 'Y' ? 'filled' : 'outlined'}
                                />
                              </Box>
                            }
                            secondary={
                              <Box>
                                <Typography variant="body2" color="text.secondary">
                                  <strong>Result:</strong> {formatTestResult(test)}
                                </Typography>
                                {test.test_type && (
                                  <Typography variant="caption" color="text.secondary">
                                    Type: {test.test_type}
                                  </Typography>
                                )}
                              </Box>
                            }
                          />
                        </ListItem>
                      )
                    })}
                  </List>
                ) : (
                  <Typography variant="body2" color="text.secondary" fontStyle="italic">
                    No test results available
                  </Typography>
                )}
              </Box>

              <Divider sx={{ mb: 2 }} />
              
              {/* Remarks/Notes */}
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                  Notes & Remarks
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {selectedReport.remarks || 'No remarks provided'}
                </Typography>
              </Box>

              {/* Report Metadata */}
              <Box sx={{ pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                <Typography variant="caption" color="text.secondary" display="block">
                  Report ID: {selectedReport.report_id}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block">
                  Source: {selectedReport.source === 'ui_upload' ? 'Web Upload' : 'CLI Upload'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Processed: {new Date(selectedReport.processing_time).toLocaleString()}
                </Typography>
              </Box>
            </>
          )}
        </DialogContent>

        <DialogActions sx={{ p: 2 }}>
          <Button 
            onClick={handleDownloadPDF} 
            variant="contained" 
            color="primary"
            startIcon={<PictureAsPdf />}
          >
            Download as PDF
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}