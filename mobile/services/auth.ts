import AsyncStorage from '@react-native-async-storage/async-storage';
import { Config } from '../types';
import { configApi, githubAuthApi } from './api';

const CONFIG_STORAGE_KEY = 'vibe_kanban_config';
const ONBOARDING_STORAGE_KEY = 'vibe_kanban_onboarding';

export interface AuthState {
  isAuthenticated: boolean;
  hasGithubToken: boolean;
  config: Config | null;
  onboardingCompleted: boolean;
}

export class AuthService {
  private static instance: AuthService;
  private listeners: ((state: AuthState) => void)[] = [];
  private currentState: AuthState = {
    isAuthenticated: false,
    hasGithubToken: false,
    config: null,
    onboardingCompleted: false,
  };

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  private constructor() {
    this.initialize();
  }

  private async initialize() {
    try {
      // Load stored config
      const storedConfig = await AsyncStorage.getItem(CONFIG_STORAGE_KEY);
      if (storedConfig) {
        this.currentState.config = JSON.parse(storedConfig);
      }

      // Load onboarding status
      const onboardingCompleted = await AsyncStorage.getItem(ONBOARDING_STORAGE_KEY);
      this.currentState.onboardingCompleted = onboardingCompleted === 'true';

      // Try to fetch fresh config from server
      try {
        const serverConfig = await configApi.getConfig();
        this.currentState.config = serverConfig;
        await this.saveConfigToStorage(serverConfig);
        this.currentState.isAuthenticated = true;
      } catch (error) {
        console.warn('Failed to fetch config from server:', error);
        // Use cached config if available
        this.currentState.isAuthenticated = this.currentState.config !== null;
      }

      // Check GitHub token status
      try {
        const hasToken = await githubAuthApi.checkGithubToken();
        this.currentState.hasGithubToken = hasToken === true;
      } catch (error) {
        console.warn('Failed to check GitHub token:', error);
      }

      this.notifyListeners();
    } catch (error) {
      console.error('Failed to initialize auth service:', error);
    }
  }

  private async saveConfigToStorage(config: Config) {
    await AsyncStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  }

  async refreshConfig(): Promise<Config | null> {
    try {
      const config = await configApi.getConfig();
      this.currentState.config = config;
      this.currentState.isAuthenticated = true;
      await this.saveConfigToStorage(config);
      this.notifyListeners();
      return config;
    } catch (error) {
      console.error('Failed to refresh config:', error);
      this.currentState.isAuthenticated = false;
      this.notifyListeners();
      return null;
    }
  }

  async saveConfig(config: Config): Promise<boolean> {
    try {
      const savedConfig = await configApi.saveConfig(config);
      this.currentState.config = savedConfig;
      await this.saveConfigToStorage(savedConfig);
      this.notifyListeners();
      return true;
    } catch (error) {
      console.error('Failed to save config:', error);
      return false;
    }
  }

  async startGithubAuth(): Promise<{
    device_code: string;
    user_code: string;
    verification_uri: string;
    expires_in: number;
    interval: number;
  }> {
    return await githubAuthApi.start();
  }

  async pollGithubAuth(deviceCode: string): Promise<string> {
    const token = await githubAuthApi.poll(deviceCode);
    this.currentState.hasGithubToken = true;
    this.notifyListeners();
    return token;
  }

  async completeOnboarding() {
    this.currentState.onboardingCompleted = true;
    await AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
    this.notifyListeners();
  }

  async logout() {
    this.currentState = {
      isAuthenticated: false,
      hasGithubToken: false,
      config: null,
      onboardingCompleted: false,
    };
    await AsyncStorage.multiRemove([CONFIG_STORAGE_KEY, ONBOARDING_STORAGE_KEY]);
    this.notifyListeners();
  }

  getState(): AuthState {
    return { ...this.currentState };
  }

  subscribe(listener: (state: AuthState) => void): () => void {
    this.listeners.push(listener);
    // Return unsubscribe function
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.getState()));
  }
}

export const authService = AuthService.getInstance();