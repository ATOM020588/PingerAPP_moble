import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';

interface User {
  id?: number;
  username: string;
  permissions?: Record<string, boolean>;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  serverConfig: { ip: string; port: string };
  setUser: (user: User | null) => void;
  setServerConfig: (config: { ip: string; port: string }) => void;
  logout: () => Promise<void>;
  saveCredentials: (login: string, passwordHash: string, remember: boolean) => Promise<void>;
  loadCredentials: () => Promise<{ login: string; passwordHash: string; remember: boolean } | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEYS = {
  USER: 'nms_user',
  CREDENTIALS: 'nms_credentials',
  SERVER_CONFIG: 'nms_server_config',
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [serverConfig, setServerConfigState] = useState({ ip: '192.168.0.56', port: '8081' });

  useEffect(() => {
    loadStoredData();
  }, []);

  const loadStoredData = async () => {
    try {
      const storedUser = await AsyncStorage.getItem(STORAGE_KEYS.USER);
      const storedConfig = await AsyncStorage.getItem(STORAGE_KEYS.SERVER_CONFIG);
      
      if (storedUser) {
        setUser(JSON.parse(storedUser));
      }
      if (storedConfig) {
        setServerConfigState(JSON.parse(storedConfig));
      }
    } catch (error) {
      console.error('Error loading stored data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const setServerConfig = async (config: { ip: string; port: string }) => {
    setServerConfigState(config);
    await AsyncStorage.setItem(STORAGE_KEYS.SERVER_CONFIG, JSON.stringify(config));
  };

  const logout = async () => {
    setUser(null);
    await AsyncStorage.removeItem(STORAGE_KEYS.USER);
  };

  const saveCredentials = async (login: string, passwordHash: string, remember: boolean) => {
    if (remember) {
      await AsyncStorage.setItem(STORAGE_KEYS.CREDENTIALS, JSON.stringify({ login, passwordHash, remember }));
    } else {
      await AsyncStorage.removeItem(STORAGE_KEYS.CREDENTIALS);
    }
  };

  const loadCredentials = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.CREDENTIALS);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  };

  const handleSetUser = async (newUser: User | null) => {
    setUser(newUser);
    if (newUser) {
      await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(newUser));
    } else {
      await AsyncStorage.removeItem(STORAGE_KEYS.USER);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        serverConfig,
        setUser: handleSetUser,
        setServerConfig,
        logout,
        saveCredentials,
        loadCredentials,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
