/**
 * App Context - Provides global state and services
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { DatabaseManager } from '../database/DatabaseManager';
import { ContentDeliveryService } from '../services/ContentDeliveryService';
import { PerformanceTrackingService } from '../services/PerformanceTrackingService';
import { StatePersistenceService } from '../services/StatePersistenceService';
import { AdaptiveContentSelectionService } from '../services/AdaptiveContentSelectionService';
import { LocalizationService } from '../services/LocalizationService';
import { AccessibilityService } from '../services/AccessibilityService';
import { CulturalContextService } from '../services/CulturalContextService';
import { initializeDatabase } from '../utils/initializeDatabase';
import { StudentProfileService } from '../services/StudentProfileService';

interface AppContextType {
  dbManager: DatabaseManager | null;
  contentService: ContentDeliveryService | null;
  performanceService: PerformanceTrackingService | null;
  stateService: StatePersistenceService | null;
  adaptiveService: AdaptiveContentSelectionService | null;
  localizationService: LocalizationService | null;
  accessibilityService: AccessibilityService | null;
  culturalContextService: CulturalContextService | null;
  studentId: string | null;
  setStudentId: (id: string) => void;
  isProfileLoaded: boolean;
  isInitialized: boolean;
  error: string | null;
  initializeServices: (studentId: string) => Promise<void>;
}

const AppContext = createContext<AppContextType>({
  dbManager: null,
  contentService: null,
  performanceService: null,
  stateService: null,
  adaptiveService: null,
  localizationService: null,
  accessibilityService: null,
  culturalContextService: null,
  studentId: null,
  setStudentId: () => {},
  isProfileLoaded: false,
  isInitialized: false,
  error: null,
  initializeServices: async () => {},
});

export const useApp = () => useContext(AppContext);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dbManager, setDbManager] = useState<DatabaseManager | null>(null);
  const [contentService, setContentService] = useState<ContentDeliveryService | null>(null);
  const [performanceService, setPerformanceService] = useState<PerformanceTrackingService | null>(null);
  const [stateService, setStateService] = useState<StatePersistenceService | null>(null);
  const [adaptiveService, setAdaptiveService] = useState<AdaptiveContentSelectionService | null>(null);
  const [localizationService, setLocalizationService] = useState<LocalizationService | null>(null);
  const [accessibilityService, setAccessibilityService] = useState<AccessibilityService | null>(null);
  const [culturalContextService, setCulturalContextService] = useState<CulturalContextService | null>(null);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [isProfileLoaded, setIsProfileLoaded] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Function to initialize services with a studentId (called after profile creation)
  const initializeServices = async (newStudentId: string) => {
    try {
      console.log('Initializing services with studentId:', newStudentId);
      
      // Set the studentId first
      setStudentId(newStudentId);

      // Initialize localization and accessibility services
      const localization = LocalizationService.getInstance();
      await localization.initialize();
      setLocalizationService(localization);

      const accessibility = AccessibilityService.getInstance();
      await accessibility.initialize();
      setAccessibilityService(accessibility);

      const culturalContext = CulturalContextService.getInstance();
      setCulturalContextService(culturalContext);

      // Initialize database
      const db = DatabaseManager.getInstance();
      await db.initialize();
      setDbManager(db);

      // Initialize sample data with the studentId
      await initializeDatabase(db, newStudentId);

      // Initialize services with the studentId
      const content = new ContentDeliveryService(db);
      const performance = new PerformanceTrackingService(db);
      const state = new StatePersistenceService(db);
      const adaptive = new AdaptiveContentSelectionService(db);

      setContentService(content);
      setPerformanceService(performance);
      setStateService(state);
      setAdaptiveService(adaptive);

      // Initialize state persistence with the studentId
      await state.initialize(newStudentId);

      setIsInitialized(true);
      console.log('Services initialization complete!');
    } catch (err) {
      console.error('Failed to initialize services:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      throw err;
    }
  };

  useEffect(() => {
    const initialize = async () => {
      try {
        console.log('Initializing app services...');

        // STEP 1: Load student profile FIRST (before any other services)
        const profileService = StudentProfileService.getInstance();
        const profile = await profileService.loadProfile();

        if (!profile) {
          // No profile exists - mark as loaded but don't initialize services
          // The app will handle navigation to onboarding
          console.log('No profile found, waiting for onboarding...');
          setIsProfileLoaded(true);
          return;
        }

        // Profile exists - initialize services with the loaded studentId
        console.log('Profile loaded:', profile.studentId);
        setIsProfileLoaded(true);
        await initializeServices(profile.studentId);
      } catch (err) {
        console.error('Failed to initialize app:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        setIsProfileLoaded(true); // Mark as loaded even on error to show error state
      }
    };

    initialize();

    return () => {
      // Cleanup
      if (stateService) {
        stateService.stopAutoSave();
      }
      if (accessibilityService) {
        accessibilityService.stopSpeaking();
      }
    };
  }, []);

  return (
    <AppContext.Provider
      value={{
        dbManager,
        contentService,
        performanceService,
        stateService,
        adaptiveService,
        localizationService,
        accessibilityService,
        culturalContextService,
        studentId,
        setStudentId,
        isProfileLoaded,
        isInitialized,
        error,
        initializeServices,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
