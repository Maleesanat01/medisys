import { Authenticator, useAuthenticator } from '@aws-amplify/ui-react'
import '@aws-amplify/ui-react/styles.css'
import { Amplify } from 'aws-amplify'
import { useState, useEffect } from 'react'
import { fetchUserAttributes } from 'aws-amplify/auth'
import ReportDashboard from './components/ReportDashboard'
import AdminDashboard from './components/AdminDashboard'
import awsconfig from './aws-exports'

Amplify.configure(awsconfig)

// Custom theme for Medisys branding with #2596be color
const theme = {
  name: 'medisys-theme',
  tokens: {
    colors: {
      brand: {
        primary: {
          10: '#e6f7fc',
          20: '#cceff9',
          40: '#7fc9e8',
          60: '#2596be',
          80: '#1e7da3',
          90: '#175f7a',
          100: '#0f4050'
        }
      },
      background: {
        primary: '#ffffff',
        secondary: '#f8f9fa'
      }
    },
    components: {
      authenticator: {
        router: {
          boxShadow: '0 8px 32px rgba(37, 150, 190, 0.15)',
          borderRadius: '16px',
          backgroundColor: 'white'
        },
        form: {
          padding: '2rem'
        }
      },
      button: {
        primary: {
          backgroundColor: '{colors.brand.primary.60}',
          _hover: {
            backgroundColor: '{colors.brand.primary.80}'
          }
        }
      },
      fieldcontrol: {
        _focus: {
          borderColor: '{colors.brand.primary.60}'
        }
      },
      link: {
        color: '{colors.brand.primary.60}',
        _hover: {
          color: '{colors.brand.primary.80}'
        }
      }
    }
  }
}

// Custom components with proper navigation
const components = {
  Header() {
    return null // We'll handle the header in the custom layout
  },
  Footer() {
    return null // We'll handle the footer in the custom layout
  },
  SignIn: {
    Header() {
      return (
        <div style={{ 
          textAlign: 'center', 
          marginBottom: '2rem'
        }}>
          <h2 style={{
            color: '#2596be',
            fontSize: '1.8rem',
            fontWeight: '600',
            margin: '0 0 0.5rem 0',
            paddingTop: '2rem'
          }}>
            Welcome Back
          </h2>
          <p style={{
            color: '#666',
            fontSize: '1rem',
            margin: 0
          }}>
            Sign in to access your MediSys dashboard
          </p>
        </div>
      )
    },
    Footer() {
      const { route, toSignIn, toSignUp, toForgotPassword } = useAuthenticator();

      return (
        <div style={{
          textAlign: 'center',
          marginTop: '1.5rem',
          color: '#666',
          fontSize: '0.9rem'
        }}>
          <p
            style={{
              margin: '0.5rem 0',
              color: '#2596be',
              cursor: 'pointer',
              textDecoration: 'underline',
              fontWeight: '500'
            }}
            onClick={() => {
              console.log('Navigating to Reset Password...');
              toForgotPassword();
            }}
          >
            Forgot your password?
          </p>
          <p style={{ margin: '0.5rem 0' }}>
            Need help? Contact your administrator
          </p>
        </div>
      );
    }
  },
  ResetPassword: {
    Header() {
      return (
        <div style={{ 
          textAlign: 'center', 
          marginBottom: '2rem'
        }}>
          <h2 style={{
            color: '#2596be',
            fontSize: '1.8rem',
            fontWeight: '600',
            margin: '0 0 0.5rem 0',
            paddingTop: '2rem'
          }}>
            Reset Password
          </h2>
          <p style={{
            color: '#666',
            fontSize: '1rem',
            margin: 0
          }}>
            Enter your email address and we'll send you a reset code
          </p>
        </div>
      )
    }
  },
  ConfirmResetPassword: {
    Header() {
      return (
        <div style={{ 
          textAlign: 'center', 
          marginBottom: '2rem'
        }}>
          <h2 style={{
            color: '#2596be',
            fontSize: '1.8rem',
            fontWeight: '600',
            margin: '0 0 0.5rem 0',
            paddingTop: '2rem'
          }}>
            Set New Password
          </h2>
          <p style={{
            color: '#666',
            fontSize: '1rem',
            margin: 0
          }}>
            Enter the verification code sent to your email and create a new password
          </p>
        </div>
      )
    }
  }
}

// Left side branding component with updated color scheme
function BrandingSide() {
  return (
    <div style={{
      flex: 1,
      background: 'linear-gradient(135deg, #2596be 0%, #1e7da3 100%)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '4rem 3rem',
      color: 'white',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Background pattern */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.1'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        opacity: 0.3
      }}></div>
      
      {/* Main branding content */}
      <div style={{ 
        zIndex: 1,
        textAlign: 'center',
        maxWidth: '400px'
      }}>
        {/* Medical Icon/Logo placeholder */}
        <div style={{
          width: '120px',
          height: '120px',
          background: 'rgba(255, 255, 255, 0.2)',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 2rem auto',
          border: '3px solid rgba(255, 255, 255, 0.3)'
        }}>
          {/* Medical cross icon */}
          <svg width="60" height="60" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" fill="white"/>
            <rect x="10" y="7" width="4" height="10" rx="1" fill="white"/>
            <rect x="7" y="10" width="10" height="4" rx="1" fill="white"/>
          </svg>
        </div>
        
        {/* Brand name */}
        <h1 style={{
          fontSize: '3.5rem',
          fontWeight: 'bold',
          margin: '0 0 1rem 0',
          textShadow: '0 4px 8px rgba(0, 0, 0, 0.1)'
        }}>
          MediSys
        </h1>
        
        {/* Tagline */}
        <p style={{
          fontSize: '1.3rem',
          fontWeight: '300',
          margin: '0 0 2rem 0',
          opacity: 0.9,
          lineHeight: 1.6
        }}>
          Diagnostic Management System
        </p>
        
        {/* Features list */}
        <div style={{
          textAlign: 'left',
          maxWidth: '300px',
          margin: '0 auto'
        }}>
          {[
            'Patient Diagnostic Records',
            'Real-time Lab Results',
            'Comprehensive Reporting',
          ].map((feature, index) => (
            <div key={index} style={{
              display: 'flex',
              alignItems: 'center',
              margin: '1rem 0',
              fontSize: '1rem',
              opacity: 0.9
            }}>
              <div style={{
                width: '6px',
                height: '6px',
                background: 'white',
                borderRadius: '50%',
                marginRight: '1rem'
              }}></div>
              {feature}
            </div>
          ))}
        </div>
      </div>
      
      {/* Bottom decoration */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '100px',
        background: 'linear-gradient(180deg, transparent 0%, rgba(0, 0, 0, 0.1) 100%)'
      }}></div>
    </div>
  )
}

// Enhanced Loading Component with updated colors
function LoadingScreen() {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      background: 'linear-gradient(135deg, #f8f9fa 0%, #e6f7fc 100%)',
      flexDirection: 'column',
      gap: '2rem'
    }}>
      <div style={{
        fontSize: '3rem',
        fontWeight: 'bold',
        background: 'linear-gradient(135deg, #2596be, #1e7da3)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
        marginBottom: '1rem'
      }}>
        MediSys
      </div>
      
      {/* Animated loading spinner */}
      <div style={{
        width: '60px',
        height: '60px',
        border: '4px solid #e6f7fc',
        borderTop: '4px solid #2596be',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
      }}></div>
      
      <div style={{
        color: '#1e7da3',
        fontSize: '1.1rem',
        fontWeight: '500'
      }}>
        Loading your profile...
      </div>
      
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

// Create a separate component to handle the authenticated state
function AuthenticatedApp({ signOut, user }) {
  const [userRole, setUserRole] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const getUserRole = async () => {
      try {
        const attributes = await fetchUserAttributes()
        const role = attributes['custom:role'] || 'user'
        console.log('User attributes:', attributes) // Debug log
        console.log('User role:', role) // Debug log
        setUserRole(role)
      } catch (error) {
        console.error('Error fetching user attributes:', error)
        setUserRole('user')
      } finally {
        setLoading(false)
      }
    }

    if (user) {
      getUserRole()
    }
  }, [user])

  // Show enhanced loading while determining role
  if (loading) {
    return <LoadingScreen />
  }

  // Route based on user role
  console.log('Routing user with role:', userRole) // Debug log
  
  if (userRole === 'admin') {
    console.log('Loading AdminDashboard') // Debug log
    return <AdminDashboard user={user} signOut={signOut} />
  } else if (userRole === 'lab' || userRole === 'healthcare') {
    console.log('Loading ReportDashboard for role:', userRole) // Debug log
    return <ReportDashboard user={user} signOut={signOut} userRole={userRole} />
  } else {
    // Enhanced access denied page with updated colors
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: 'linear-gradient(135deg, #f8f9fa 0%, #e6f7fc 100%)',
        flexDirection: 'column',
        gap: '2rem',
        padding: '2rem'
      }}>
        <div style={{
          background: 'white',
          padding: '3rem',
          borderRadius: '16px',
          boxShadow: '0 8px 32px rgba(37, 150, 190, 0.15)',
          textAlign: 'center',
          maxWidth: '400px'
        }}>
          <div style={{
            fontSize: '2.5rem',
            fontWeight: 'bold',
            background: 'linear-gradient(135deg, #2596be, #1e7da3)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            marginBottom: '1rem'
          }}>
            MediSys
          </div>
          
          <h2 style={{ color: '#2596be', marginBottom: '1rem' }}>Access Denied</h2>
          <p style={{ color: '#666', marginBottom: '1rem' }}>
            Your account doesn't have the proper role assigned. Contact your administrator.
          </p>
          <p style={{ color: '#999', fontSize: '0.9rem', marginBottom: '2rem' }}>
            Current role: {userRole || 'undefined'}
          </p>
          
          <button 
            onClick={signOut} 
            style={{ 
              padding: '12px 24px', 
              fontSize: '16px',
              backgroundColor: '#2596be',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '500',
              transition: 'background-color 0.2s'
            }}
            onMouseOver={(e) => e.target.style.backgroundColor = '#1e7da3'}
            onMouseOut={(e) => e.target.style.backgroundColor = '#2596be'}
          >
            Sign Out
          </button>
        </div>
      </div>
    )
  }
}

export default function App() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex'
    }}>
      {/* Left side - Branding */}
      <BrandingSide />
      
      {/* Right side - Authentication Form */}
      <div style={{ 
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #f8f9fa 0%, #e6f7fc 100%)',
        padding: '2rem',
        position: 'relative'
      }}>
        <div style={{
          width: '100%',
          maxWidth: '400px'
        }}>
          <Authenticator
            theme={theme}
            components={components}
            hideSignUp={true}
            loginMechanisms={['email']}
            signUpAttributes={[]}
            initialState="signIn"
          >
            {({ signOut, user }) => {
              // When authenticated, replace the entire layout with the dashboard
              return (
                <div style={{ 
                  width: '100vw', 
                  height: '100vh',
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  zIndex: 1000,
                  background: 'white',
                  overflow: 'auto'  // Allow scrolling
                }}>
                  <AuthenticatedApp signOut={signOut} user={user} />
                </div>
              )
            }}
          </Authenticator>
        </div>
      </div>
    </div>
  )
}