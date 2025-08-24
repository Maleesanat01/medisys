import { useState, useEffect } from 'react';
import { uploadData } from 'aws-amplify/storage';
import { useDropzone } from 'react-dropzone';
import { 
  Button, 
  CircularProgress, 
  Box, 
  Typography, 
  Alert,
  Snackbar,
  LinearProgress
} from '@mui/material';
import { CloudUpload, CheckCircle, Error } from '@mui/icons-material';
import { fetchUserAttributes } from 'aws-amplify/auth';

export default function FileUpload({ onSuccess, userRole }) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success'
  });

  const { getRootProps, getInputProps } = useDropzone({
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']
    },
    maxFiles: 1,
    disabled: userRole !== 'lab' || isUploading,
    onDrop: async (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        await handleUpload(acceptedFiles[0]);
      }
    }
  });

  const handleUpload = async (file) => {
    setIsUploading(true);
    setUploadProgress(0);
    
    try {
      // Validate file structure
      const validationResult = await validateMediSysCSV(file);
      if (!validationResult.isValid) {
        throw new Error(validationResult.message);
      }

      // Get user attributes to include clinic_id in the S3 key
      const attributes = await fetchUserAttributes();
      const clinicId = attributes['custom:clinic_id'] || 'unknown';
      
      // timestamp to filename to avoid conflicts 
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `${timestamp}_${file.name}`;
      
      console.log('Uploading file:', {
        originalName: file.name,
        newName: fileName,
        clinicId: clinicId,
        size: file.size,
        type: file.type,
        patientCount: validationResult.patientCount,
        testCount: validationResult.testCount
      });

      //  create the path: public/uploads/clinic_id/filename.csv
      const result = await uploadData({
        key: `uploads/${clinicId}/${fileName}`,
        data: file,
        options: {
          accessLevel: 'guest',
          contentType: file.type || 'text/csv',
          onProgress: ({ transferredBytes, totalBytes }) => {
            setUploadProgress(Math.round((transferredBytes / totalBytes) * 100));
          }
        }
      }).result;

      console.log('Upload success:', result);
      
      setSnackbar({
        open: true,
        message: `Report uploaded successfully! Found ${validationResult.patientCount} patients with ${validationResult.testCount} total tests. Processing will begin shortly...`,
        severity: 'success'
      });
      
      // Call onSuccess callback to refresh the reports list
      if (onSuccess) {
        // Add delay to allow processing
        setTimeout(() => {
          onSuccess();
        }, 5000);
      }
    } catch (err) {
      console.error('Upload failed:', err);
      setSnackbar({
        open: true,
        message: err.message || 'Upload failed. Please try again.',
        severity: 'error'
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const validateMediSysCSV = async (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target.result;
          console.log('Validating MediSys CSV content:', content.substring(0, 300));
          
          if (!content || content.trim().length === 0) {
            console.log('Validation failed: Empty file');
            resolve({
              isValid: false,
              message: 'File is empty. Please upload a valid MediSys diagnostic CSV file.'
            });
            return;
          }

          const lines = content.split('\n').filter(line => line.trim());
          
          if (lines.length < 2) {
            console.log('Validation failed: Not enough lines');
            resolve({
              isValid: false,
              message: 'CSV file must have at least a header row and one data row.'
            });
            return;
          }

          // Check for MediSys CSV format headers
          const headerLine = lines[0].toLowerCase();
          const requiredColumns = [
            'patient_id',
            'first_name', 
            'last_name',
            'test_name',
            'result_value'
          ];

          const missingColumns = requiredColumns.filter(col => 
            !headerLine.includes(col.toLowerCase())
          );

          if (missingColumns.length > 0) {
            console.log('Validation failed: Missing required columns:', missingColumns);
            resolve({
              isValid: false,
              message: `Missing required columns: ${missingColumns.join(', ')}. Please ensure this is a MediSys diagnostic CSV file.`
            });
            return;
          }

          // Parse data to check structure and count patients/tests
          try {
            const dataLines = lines.slice(1); // Skip header
            const patients = new Set();
            let testCount = 0;

            for (const line of dataLines) {
              const cells = line.split(',');
              if (cells.length >= 5) { // At least patient_id, name, test info
                const patientId = cells[0]?.trim();
                const testName = cells.find((cell, index) => {
                  // Find test_name column (usually around index 8)
                  return cell && cell.trim().length > 0 && index > 5;
                });

                if (patientId) {
                  patients.add(patientId);
                }
                if (testName && testName.trim()) {
                  testCount++;
                }
              }
            }

            if (patients.size === 0) {
              resolve({
                isValid: false,
                message: 'No valid patient records found in the CSV file.'
              });
              return;
            }

            if (testCount === 0) {
              resolve({
                isValid: false,
                message: 'No valid test results found in the CSV file.'
              });
              return;
            }

            console.log('Validation successful:', {
              patientCount: patients.size,
              testCount: testCount,
              totalRows: dataLines.length
            });

            resolve({
              isValid: true,
              message: 'Valid MediSys CSV format detected.',
              patientCount: patients.size,
              testCount: testCount
            });

          } catch (parseError) {
            console.error('Error parsing CSV data:', parseError);
            resolve({
              isValid: false,
              message: 'Error parsing CSV data. Please check the file format.'
            });
          }
          
        } catch (error) {
          console.error('Validation error:', error);
          resolve({
            isValid: false,
            message: 'Error reading file. Please try again.'
          });
        }
      };
      
      reader.onerror = () => {
        console.error('FileReader error');
        resolve({
          isValid: false,
          message: 'Error reading file. Please try again.'
        });
      };
      
      reader.readAsText(file);
    });
  };

  const handleCloseSnackbar = () => {
    setSnackbar(prev => ({ ...prev, open: false }));
  };

  // Show loading state while fetching user role
  if (userRole === null || userRole === undefined) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Loading user permissions...</Typography>
      </Box>
    );
  }

  // Show restriction message for non-lab users
  if (userRole !== 'lab') {
    return (
      <Alert 
        severity="info" 
        sx={{ mb: 2 }}
        icon={<CloudUpload fontSize="inherit" />}
      >
        <Typography variant="body1">
          Report upload is restricted to laboratory/clinic staff only.
        </Typography>
        <Typography variant="body2" sx={{ mt: 1 }}>
          Please contact your administrator if you need upload access.
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          Current role: {userRole}
        </Typography>
      </Alert>
    );
  }

  // Main upload interface for lab users
  return (
    <>
      <Box
        {...getRootProps()} 
        sx={{ 
          border: '2px dashed',
          borderColor: isUploading ? 'primary.light' : 'grey.400',
          borderRadius: 1,
          p: 4,
          textAlign: 'center',
          cursor: isUploading ? 'wait' : 'pointer',
          backgroundColor: isUploading ? 'action.hover' : 'background.paper',
          transition: 'all 0.3s ease',
          '&:hover': {
            borderColor: isUploading ? 'primary.light' : 'primary.main',
            backgroundColor: isUploading ? 'action.hover' : 'action.hover'
          }
        }}
      >
        <input {...getInputProps()} />
        {isUploading ? (
          <Box sx={{ width: '100%' }}>
            <CircularProgress sx={{ mb: 2 }} />
            <Typography variant="body1" sx={{ mb: 1 }}>
              Uploading MediSys report... {uploadProgress}%
            </Typography>
            <LinearProgress 
              variant="determinate" 
              value={uploadProgress} 
              sx={{ height: 8, borderRadius: 4 }}
            />
          </Box>
        ) : (
          <>
            <CloudUpload fontSize="large" color="primary" sx={{ mb: 1 }} />
            <Typography variant="h6" sx={{ mb: 1 }}>
              Drag & drop MediSys diagnostic reports here
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Supported formats: CSV, XLS, XLSX
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontStyle: 'italic' }}>
              Expected format: MediSys diagnostic CSV with patient_id, names, and test results
            </Typography>
            <Alert severity="info" sx={{ mb: 2, textAlign: 'left' }}>
              <Typography variant="body2">
                <strong>Required CSV columns:</strong>
              </Typography>
              <Typography variant="caption" component="div">
                patient_id, first_name, last_name, test_name, result_value
              </Typography>
            </Alert>
            <Button 
              variant="contained" 
              color="primary"
              disabled={isUploading}
            >
              Select MediSys CSV File
            </Button>
          </>
        )}
      </Box>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={8000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={handleCloseSnackbar}
          severity={snackbar.severity}
          icon={snackbar.severity === 'success' ? <CheckCircle /> : <Error />}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
}