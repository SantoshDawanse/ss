/**
 * React hook for graceful degradation features.
 */

import { useState, useEffect } from 'react';
import {
  GracefulDegradationService,
  DegradationMode,
  ResourceStatus,
} from '../services/GracefulDegradationService';

export function useGracefulDegradation() {
  const [resourceStatus, setResourceStatus] = useState<ResourceStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const service = GracefulDegradationService.getInstance();
  
  useEffect(() => {
    let mounted = true;
    
    const initialize = async () => {
      try {
        await service.initialize();
        
        if (mounted) {
          const status = await service.getResourceStatus();
          setResourceStatus(status);
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Failed to initialize graceful degradation:', error);
        setIsLoading(false);
      }
    };
    
    initialize();
    
    // Update status periodically
    const interval = setInterval(async () => {
      if (mounted) {
        const status = await service.getResourceStatus();
        setResourceStatus(status);
      }
    }, 30000); // Update every 30 seconds
    
    return () => {
      mounted = false;
      clearInterval(interval);
      service.cleanup();
    };
  }, []);
  
  return {
    resourceStatus,
    isLoading,
    shouldEnableBackgroundSync: service.shouldEnableBackgroundSync(),
    shouldEnableAnimations: service.shouldEnableAnimations(),
    imageQuality: service.getImageQuality(),
    preloadCount: service.getPreloadCount(),
    autoSaveInterval: service.getAutoSaveInterval(),
    isInPowerSavingMode: service.isInPowerSavingMode(),
    recommendations: service.getPerformanceRecommendations(),
  };
}
