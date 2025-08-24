import { useState, useEffect, useCallback } from 'react';
import { get, del } from 'aws-amplify/api';
import { 
  Box, 
  Badge, 
  IconButton, 
  Popover, 
  List, 
  ListItem, 
  ListItemText,
  ListItemIcon,
  Typography,
  Button,
  Chip,
  Divider,
  Alert,
  CircularProgress
} from '@mui/material';
import { 
  Notifications, 
  NotificationsActive,
  Assessment,
  Person,
  LocalHospital,
  Close
} from '@mui/icons-material';
import { fetchAuthSession } from 'aws-amplify/auth';

export default function NotificationCenter({ userRole }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [anchorEl, setAnchorEl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // poll for notifications every 30 seconds for healthcare users
  const pollNotifications = useCallback(async () => {
    if (userRole !== 'healthcare') return;
    
    try {
      setLoading(true);
      setError(null);
      
      const session = await fetchAuthSession();
      if (!session.tokens?.idToken) {
        throw new Error('No valid authentication token found');
      }

      const response = await get({
        apiName: 'MedisysAPI',
        path: '/notifications',
        options: {
          headers: {
            Authorization: session.tokens.idToken.toString()
          }
        }
      }).response;

      const data = await response.body.json();
      console.log('Fetched notifications:', data);
      
      if (data.notifications && Array.isArray(data.notifications)) {
        setNotifications(data.notifications);
        setUnreadCount(data.notifications.length);
      } else {
        setNotifications([]);
        setUnreadCount(0);
      }
      
    } catch (err) {
      console.error('Error fetching notifications:', err);
      setError(err.message || 'Failed to fetch notifications');
      
      // if an auth error, clear notifications
      if (err.message?.includes('authentication') || err.message?.includes('token')) {
        setNotifications([]);
        setUnreadCount(0);
      }
    } finally {
      setLoading(false);
    }
  }, [userRole]);


  useEffect(() => {
    if (userRole === 'healthcare') {
      // Initial fetch
      pollNotifications();
      
      // Set up polling notification queue every 30 seconds
      const interval = setInterval(pollNotifications, 30000);
      
      return () => clearInterval(interval);
    }
  }, [userRole, pollNotifications]);

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const acknowledgeNotification = async (notificationId, receiptHandle) => {
    try {
      const session = await fetchAuthSession();
      
      if (!session.tokens?.idToken) {
        throw new Error('No valid authentication token found');
      }

      // Call the DELETE endpoint to acknowledge the notification
      await del({
        apiName: 'MedisysAPI',
        path: `/notifications/${receiptHandle}`, 
        options: {
          headers: {
            Authorization: session.tokens.idToken.toString()
          }
        }
      }).response;

      
      setNotifications(prev => 
        prev.filter(notification => notification.id !== notificationId)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
      
      console.log(`Acknowledged notification: ${notificationId}`);
      
    } catch (err) {
      console.error('Error acknowledging notification:', err);
      setError('Failed to acknowledge notification');
    }
  };

  const clearAllNotifications = async () => {
    try {
      // Acknowledge all notifications
      const acknowledgePromises = notifications.map(notification => 
        acknowledgeNotification(notification.id, notification.receipt_handle)
      );
      
      await Promise.all(acknowledgePromises);
      
      setNotifications([]);
      setUnreadCount(0);
      handleClose();
      
    } catch (err) {
      console.error('Error clearing all notifications:', err);
      setError('Failed to clear all notifications');
    }
  };

  const formatTimestamp = (timestamp) => {
    try {
      return new Date(timestamp).toLocaleString();
    } catch {
      return 'Unknown time';
    }
  };

  const open = Boolean(anchorEl);

  // Don't render for non-healthcare users
  if (userRole !== 'healthcare') {
    return null;
  }

  return (
    <>
      <IconButton
        color="inherit"
        onClick={handleClick}
        sx={{ mr: 2 }}
        disabled={loading}
      >
        <Badge badgeContent={unreadCount} color="error">
          {loading ? (
            <CircularProgress size={24} color="inherit" />
          ) : unreadCount > 0 ? (
            <NotificationsActive />
          ) : (
            <Notifications />
          )}
        </Badge>
      </IconButton>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        PaperProps={{
          sx: { width: 400, maxHeight: 500 }
        }}
      >
        <Box sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Assessment color="primary" />
              New Reports ({unreadCount})
            </Typography>
            <IconButton size="small" onClick={handleClose}>
              <Close />
            </IconButton>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {loading && notifications.length === 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 2 }}>
              <CircularProgress size={20} sx={{ mr: 1 }} />
              <Typography variant="body2" color="text.secondary">
                Checking for new reports...
              </Typography>
            </Box>
          )}

          {notifications.length === 0 && !loading && (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
              No new notifications
            </Typography>
          )}

          <List sx={{ maxHeight: 350, overflow: 'auto' }}>
            {notifications.map((notification, index) => (
              <Box key={notification.id || index}>
                <ListItem
                  sx={{ 
                    px: 0,
                    py: 1,
                    flexDirection: 'column',
                    alignItems: 'stretch'
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', mb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Person fontSize="small" color="primary" />
                      <Typography variant="body2" fontWeight="bold">
                        {notification.patient_name || 'Unknown Patient'}
                      </Typography>
                    </Box>
                    <Chip 
                      label={notification.clinic_id || 'Unknown Clinic'} 
                      size="small" 
                      variant="outlined"
                      icon={<LocalHospital fontSize="small" />}
                    />
                  </Box>

                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Patient ID: {notification.patient_id || 'N/A'} • {notification.test_count || 0} tests
                  </Typography>

                  {notification.test_summary && notification.test_summary.length > 0 && (
                    <Box sx={{ mb: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        Test Preview:
                      </Typography>
                      {notification.test_summary.slice(0, 3).map((test, testIndex) => (
                        <Typography key={testIndex} variant="body2" sx={{ fontSize: '0.8rem', ml: 1 }}>
                          • {test.test_name}: {test.result} {test.unit}
                        </Typography>
                      ))}
                      {notification.test_summary.length > 3 && (
                        <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                          +{notification.test_summary.length - 3} more tests
                        </Typography>
                      )}
                    </Box>
                  )}

                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      {formatTimestamp(notification.created_at)}
                    </Typography>
                    {/* <Button
                      size="small"
                      variant="outlined"
                      onClick={() => acknowledgeNotification(notification.id, notification.receipt_handle)}
                      disabled={!notification.receipt_handle}
                    >
                      Mark as Read
                    </Button> */}
                  </Box>
                </ListItem>
                {index < notifications.length - 1 && <Divider />}
              </Box>
            ))}
          </List>

          {notifications.length > 0 && (
            <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
              <Button
                fullWidth
                variant="text"
                size="small"
                onClick={clearAllNotifications}
                disabled={loading}
              >
                Clear All Notifications
              </Button>
            </Box>
          )}
        </Box>
      </Popover>
    </>
  );
}