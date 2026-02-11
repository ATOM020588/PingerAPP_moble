import * as Crypto from 'expo-crypto';
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';

type MessageHandler = (data: any) => void;
type ConnectionHandler = (connected: boolean) => void;

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  timeout: ReturnType<typeof setTimeout>;
}

interface WebSocketContextType {
  isConnected: boolean;
  isConnecting: boolean;
  connect: (ip: string, port: string) => void;
  disconnect: () => void;
  sendRequest: <T = any>(action: string, params?: Record<string, any>) => Promise<T>;
  addMessageHandler: (handler: MessageHandler) => () => void;
  addConnectionHandler: (handler: ConnectionHandler) => () => void;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const pendingRequestsRef = useRef<Map<string, PendingRequest>>(new Map());
  const messageHandlersRef = useRef<Set<MessageHandler>>(new Set());
  const connectionHandlersRef = useRef<Set<ConnectionHandler>>(new Set());
  const serverConfigRef = useRef({ ip: '192.168.0.56', port: '8081' });
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;

  const notifyConnectionHandlers = useCallback((connected: boolean) => {
    connectionHandlersRef.current.forEach(handler => handler(connected));
  }, []);

  const generateRequestId = (): string => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  const connect = useCallback((ip: string, port: string) => {
    // Don't reconnect if already connected or connecting
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }

    if (isConnecting) {
      console.log('WebSocket already connecting');
      return;
    }

    // Clear any pending reconnect
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    serverConfigRef.current = { ip, port };
    setIsConnecting(true);

    try {
      const uri = `ws://${ip}:${port}`;
      console.log('Connecting to WebSocket:', uri);

      // Close existing connection if any
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.onmessage = null;
        wsRef.current.onopen = null;
        wsRef.current.close();
        wsRef.current = null;
      }

      const ws = new WebSocket(uri);

      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setIsConnecting(false);
        reconnectAttemptsRef.current = 0;
        notifyConnectionHandlers(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('WebSocket message received:', data);

          // Check if this is a response to a pending request
          if (data.request_id && pendingRequestsRef.current.has(data.request_id)) {
            const pending = pendingRequestsRef.current.get(data.request_id)!;
            clearTimeout(pending.timeout);
            pendingRequestsRef.current.delete(data.request_id);
            pending.resolve(data);
          }

          // Notify all message handlers
          messageHandlersRef.current.forEach(handler => handler(data));
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      ws.onclose = (event) => {
        console.log('WebSocket disconnected, code:', event.code);
        setIsConnected(false);
        setIsConnecting(false);
        wsRef.current = null;
        notifyConnectionHandlers(false);

        // Reject all pending requests
        pendingRequestsRef.current.forEach((pending) => {
          clearTimeout(pending.timeout);
          pending.reject(new Error('Connection closed'));
        });
        pendingRequestsRef.current.clear();

        // Auto-reconnect with backoff
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
          console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1})`);
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++;
            connect(serverConfigRef.current.ip, serverConfigRef.current.port);
          }, delay);
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Error creating WebSocket:', error);
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    reconnectAttemptsRef.current = maxReconnectAttempts; // Prevent auto-reconnect

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.onclose = null; // Prevent reconnect on manual disconnect
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnected(false);
    setIsConnecting(false);

    // Reject all pending requests
    pendingRequestsRef.current.forEach((pending) => {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Disconnected'));
    });
    pendingRequestsRef.current.clear();
  }, []);

  const sendRequest = useCallback(<T = any>(action: string, params: Record<string, any> = {}): Promise<T> => {
    return new Promise((resolve, reject) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      const requestId = generateRequestId();
      const request = {
        action,
        request_id: requestId,
        ...params,
      };

      const timeout = setTimeout(() => {
        if (pendingRequestsRef.current.has(requestId)) {
          pendingRequestsRef.current.delete(requestId);
          reject(new Error('Request timeout'));
        }
      }, 30000);

      pendingRequestsRef.current.set(requestId, { resolve, reject, timeout });

      try {
        console.log('Sending WebSocket request:', request);
        wsRef.current.send(JSON.stringify(request));
      } catch (error) {
        clearTimeout(timeout);
        pendingRequestsRef.current.delete(requestId);
        reject(error);
      }
    });
  }, []);

  const addMessageHandler = useCallback((handler: MessageHandler) => {
    messageHandlersRef.current.add(handler);
    return () => messageHandlersRef.current.delete(handler);
  }, []);

  const addConnectionHandler = useCallback((handler: ConnectionHandler) => {
    connectionHandlersRef.current.add(handler);
    return () => connectionHandlersRef.current.delete(handler);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return (
    <WebSocketContext.Provider
      value={{
        isConnected,
        isConnecting,
        connect,
        disconnect,
        sendRequest,
        addMessageHandler,
        addConnectionHandler,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocketContext() {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context;
}

// Utility function to hash password with SHA-256
export async function hashPassword(password: string): Promise<string> {
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    password
  );
  return hash;
}
