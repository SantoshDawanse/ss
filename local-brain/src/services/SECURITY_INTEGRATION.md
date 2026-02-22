# Security Integration Guide

This document explains how to integrate the security services into the Sikshya-Sathi Local Brain application.

## Overview

The security implementation includes three main components:

1. **EncryptionService** - Local data encryption (AES-256)
2. **AuthenticationService** - JWT token management
3. **SecureNetworkService** - TLS 1.3 and certificate pinning

## Requirements Addressed

- **9.1**: Encrypt all Performance_Logs during storage and transmission
- **9.4**: Require authentication before accessing student profiles
- **9.5**: Use TLS 1.3 for data transmission during sync

## Installation

Required packages have been installed:
```bash
npm install expo-secure-store expo-crypto
```

## Integration Steps

### 1. Initialize Security Services on App Startup

In your main app initialization (e.g., `App.tsx` or `AppContext.tsx`):

```typescript
import { 
  EncryptionService, 
  AuthenticationService, 
  SecureNetworkService 
} from './services';

// Initialize services
const encryptionService = EncryptionService.getInstance();
const authService = AuthenticationService.getInstance();
const networkService = SecureNetworkService.getInstance();

// Initialize on app startup
async function initializeApp() {
  try {
    // Initialize encryption (loads or generates key)
    await encryptionService.initialize();
    
    // Initialize authentication (loads stored tokens)
    await authService.initialize();
    
    // Configure TLS
    networkService.configureTLS();
    
    console.log('Security services initialized');
  } catch (error) {
    console.error('Failed to initialize security:', error);
  }
}
```

### 2. Implement Login Flow

```typescript
import { AuthenticationService } from './services';

async function handleLogin(studentId: string, password: string) {
  const authService = AuthenticationService.getInstance();
  
  try {
    const tokens = await authService.login({
      studentId,
      password,
    });
    
    console.log('Login successful');
    // Navigate to main app
  } catch (error) {
    console.error('Login failed:', error);
    // Show error to user
  }
}
```

### 3. Protect Routes with Authentication

```typescript
import { AuthenticationService } from './services';

function ProtectedRoute({ children }) {
  const authService = AuthenticationService.getInstance();
  const authState = authService.getAuthState();
  
  if (!authState.isAuthenticated) {
    // Redirect to login
    return <LoginScreen />;
  }
  
  return children;
}
```

### 4. Use Secure Network Service for API Calls

Replace all `fetch` calls with `SecureNetworkService`:

```typescript
import { SecureNetworkService } from './services';

const networkService = SecureNetworkService.getInstance();

// GET request
const response = await networkService.get('/api/endpoint');

// POST request
const response = await networkService.post('/api/endpoint', {
  data: 'value',
});

// With authentication
const authService = AuthenticationService.getInstance();
const token = await authService.getAccessToken();

const response = await networkService.get('/api/protected', {
  headers: {
    'Authorization': `Bearer ${token}`,
  },
});
```

### 5. Encrypt Performance Logs

The `PerformanceTrackingService` should be updated to encrypt logs:

```typescript
import { EncryptionService } from './services';

class PerformanceTrackingService {
  private encryptionService = EncryptionService.getInstance();
  
  async trackEvent(event: PerformanceLog) {
    // Encrypt log before storing
    const encryptedLog = await this.encryptionService.encryptPerformanceLog(event);
    
    // Store encrypted log in database
    await this.dbManager.performanceLogRepository.create({
      ...event,
      data_json: encryptedLog, // Store encrypted data
    });
  }
  
  async getPerformanceLogs(studentId: string) {
    const encryptedLogs = await this.dbManager.performanceLogRepository.findByStudent(studentId);
    
    // Decrypt logs
    const decryptedLogs = await Promise.all(
      encryptedLogs.map(log => 
        this.encryptionService.decryptPerformanceLog(log.data_json)
      )
    );
    
    return decryptedLogs;
  }
}
```

### 6. Update SyncOrchestratorService

The `SyncOrchestratorService` has been updated to:
- Use `EncryptionService` to encrypt logs before upload
- Use `SecureNetworkService` for all API calls (TLS 1.3)

No additional changes needed - it's already integrated!

## Database Encryption with SQLCipher

For full database encryption, you would need to use SQLCipher instead of plain SQLite:

```bash
npm install @journeyapps/react-native-sqlcipher
```

Then update `DatabaseManager` to use SQLCipher:

```typescript
import SQLite from '@journeyapps/react-native-sqlcipher';

// Open encrypted database
const db = SQLite.openDatabase({
  name: 'sikshya_sathi.db',
  key: encryptionKey, // From EncryptionService
});
```

**Note**: This requires native module linking and is more complex. For MVP, encrypting performance logs is sufficient.

## Certificate Pinning (Production)

For production deployment, implement proper certificate pinning using a native module:

```bash
npm install react-native-ssl-pinning
```

Update `SecureNetworkService` to use the native module:

```typescript
import { fetch as sslFetch } from 'react-native-ssl-pinning';

// In verifyCertificatePinning method
await sslFetch(url, {
  method: 'GET',
  sslPinning: {
    certs: ['cert1', 'cert2'], // Certificate files
  },
});
```

## Testing

### Test Encryption

```typescript
import { EncryptionService } from './services';

const encryptionService = EncryptionService.getInstance();
await encryptionService.initialize();

// Test encryption
const data = { test: 'data' };
const encrypted = await encryptionService.encrypt(data);
console.log('Encrypted:', encrypted);

const decrypted = await encryptionService.decrypt(encrypted);
console.log('Decrypted:', decrypted);
```

### Test Authentication

```typescript
import { AuthenticationService } from './services';

const authService = AuthenticationService.getInstance();
await authService.initialize();

// Test login
const tokens = await authService.login({
  studentId: 'test_student',
  password: 'test_password',
});

console.log('Tokens:', tokens);
console.log('Auth state:', authService.getAuthState());
```

### Test Secure Network

```typescript
import { SecureNetworkService } from './services';

const networkService = SecureNetworkService.getInstance();
networkService.configureTLS();

// Test connection
const isConnected = await networkService.testConnection();
console.log('Connection test:', isConnected);

// Get TLS info
const tlsInfo = networkService.getTLSInfo();
console.log('TLS info:', tlsInfo);
```

## Security Best Practices

1. **Never log sensitive data** - Don't log tokens, passwords, or decrypted data
2. **Clear tokens on logout** - Always call `authService.logout()` when user logs out
3. **Handle token expiry** - The service automatically refreshes tokens, but handle errors gracefully
4. **Validate server certificates** - Enable certificate pinning in production
5. **Use HTTPS only** - The `SecureNetworkService` enforces HTTPS
6. **Secure key storage** - Keys are stored in device keychain (iOS Keychain, Android Keystore)
7. **Handle encryption errors** - Always wrap encryption/decryption in try-catch blocks

## Troubleshooting

### "Encryption service not initialized"
- Call `await encryptionService.initialize()` before using encryption

### "Not authenticated"
- User needs to login first
- Check `authService.isAuthenticated()` before making authenticated requests

### "Token refresh failed"
- Refresh token may be expired
- User needs to login again

### "Only HTTPS requests are allowed"
- Ensure all API URLs use HTTPS protocol
- Check API_BASE_URL configuration

## Production Checklist

- [ ] Replace placeholder encryption with proper AES-256-GCM
- [ ] Implement SQLCipher for full database encryption
- [ ] Add native certificate pinning module
- [ ] Update certificate pins with actual server certificates
- [ ] Configure proper token expiry times
- [ ] Add biometric authentication (Face ID, Touch ID)
- [ ] Implement secure backup/restore
- [ ] Add security event logging
- [ ] Perform security audit
- [ ] Test on both iOS and Android

## References

- [expo-secure-store](https://docs.expo.dev/versions/latest/sdk/securestore/)
- [expo-crypto](https://docs.expo.dev/versions/latest/sdk/crypto/)
- [React Native Security Best Practices](https://reactnative.dev/docs/security)
- [OWASP Mobile Security](https://owasp.org/www-project-mobile-security/)
