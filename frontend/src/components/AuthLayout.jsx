import { useAuthenticator } from '@aws-amplify/ui-react'

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

export default function AuthLayout() {
  const { authStatus } = useAuthenticator()
  
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex'
    }}>
      {/* Left side - Branding */}
      <BrandingSide />
      
      {/* Right side - Authentication */}
      <div style={{
        flex: 1,
        background: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        minHeight: '100vh'
      }}>
        <div style={{
          width: '100%',
          maxWidth: '400px'
        }}>
          {/*  Authenticator component will render its forms */}
          <div id="auth-container">
            {/* Authenticator will inject forms here */}
          </div>
        </div>
      </div>
    </div>
  )
}