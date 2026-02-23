/**
 * Business logic services for Local Brain.
 */

export { ContentDeliveryService } from './ContentDeliveryService';
export type { QuizFeedback } from './ContentDeliveryService';

export { PerformanceTrackingService } from './PerformanceTrackingService';
export type { TrackEventParams, BatchedLogs } from './PerformanceTrackingService';

export { StatePersistenceService } from './StatePersistenceService';
export type { LessonState, QuizState, AppState } from './StatePersistenceService';

export { AdaptiveRulesEngine } from './AdaptiveRulesEngine';
export type { AdaptiveContent, AdaptiveRule, RuleResult, PerformanceMetrics } from './AdaptiveRulesEngine';

export { AdaptiveContentSelectionService } from './AdaptiveContentSelectionService';
export type { ContentSelectionResult } from './AdaptiveContentSelectionService';

export { SyncOrchestratorService } from './SyncOrchestratorService';
export type { SyncState, SyncStatus } from './SyncOrchestratorService';

export { BundleImportService } from './BundleImportService';

export { EncryptionService } from './EncryptionService';
export type { EncryptedData } from './EncryptionService';

export { AuthenticationService } from './AuthenticationService';
export type { AuthTokens, LoginCredentials, AuthState } from './AuthenticationService';

export { SecureNetworkService } from './SecureNetworkService';
export type { SecureRequestOptions, SecureResponse } from './SecureNetworkService';

export { LocalizationService } from './LocalizationService';

export { AccessibilityService } from './AccessibilityService';

export { CulturalContextService } from './CulturalContextService';
export type { CulturalContextConfig, ContentValidationResult } from './CulturalContextService';

export { MonitoringService } from './MonitoringService';
export type {
  MetricType,
  CrashReport,
  AnalyticsEvent,
  SyncAnalytics,
  OfflineAnalytics,
  ResourceUsage,
} from './MonitoringService';

export { StudentProfileService } from './StudentProfileService';
export type { StudentProfile } from './StudentProfileService';
