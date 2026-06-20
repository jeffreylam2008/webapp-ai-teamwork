export interface AppConfig {
  debug: 'on' | 'off';
  version: string;
  environment: 'development' | 'production' | 'test';
}

export const appConfig: AppConfig = {
  debug: 'on', // Set to 'off' to disable debug features
  version: '1.0.0',
  environment: 'development'
};

// Helper function to check if debug is enabled
export const isDebugEnabled = (): boolean => {
  return appConfig.debug === 'on';
};

// Helper function to get debug status
export const getDebugStatus = (): string => {
  return appConfig.debug;
}; 