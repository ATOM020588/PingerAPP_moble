import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, VERSION } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { hashPassword, useWebSocketContext } from '../context/WebSocketContext';

export default function LoginScreen() {
  const router = useRouter();
  const { setUser, serverConfig, setServerConfig, saveCredentials, loadCredentials } = useAuth();
  const { isConnected, isConnecting, connect, disconnect, sendRequest, addConnectionHandler } = useWebSocketContext();

  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Отключено от сервера');
  const [showServerDialog, setShowServerDialog] = useState(false);
  const [tempServerIp, setTempServerIp] = useState(serverConfig.ip);
  const [tempServerPort, setTempServerPort] = useState(serverConfig.port);

  const passwordRef = useRef<TextInput>(null);
  const hasLoadedCredentials = useRef(false);

  useEffect(() => {
    // Load saved credentials on mount
    const loadSaved = async () => {
      if (hasLoadedCredentials.current) return;
      hasLoadedCredentials.current = true;

      const creds = await loadCredentials();
      if (creds && creds.remember) {
        setLogin(creds.login);
        setPassword('********'); // Placeholder for saved password
        setRememberMe(true);
      }
    };
    loadSaved();
  }, []);

  useEffect(() => {
    // Connect to server on mount
    connect(serverConfig.ip, serverConfig.port);

    const removeHandler = addConnectionHandler((connected) => {
      if (connected) {
        setStatusMessage('Подключено к серверу');
      } else {
        setStatusMessage('Отключено от сервера');
      }
    });

    return () => {
      removeHandler();
    };
  }, [serverConfig]);

  const handleLogin = async () => {
    if (!login.trim()) {
      Alert.alert('Ошибка', 'Введите логин');
      return;
    }
    if (!password.trim()) {
      Alert.alert('Ошибка', 'Введите пароль');
      return;
    }

    if (!isConnected) {
      Alert.alert('Ошибка', 'Нет подключения к серверу');
      return;
    }

    setIsLoggingIn(true);
    setStatusMessage('Авторизация...');

    try {
      // Hash password (or use stored hash if password is placeholder)
      let passwordHash: string;
      if (password === '********') {
        const creds = await loadCredentials();
        if (creds) {
          passwordHash = creds.passwordHash;
        } else {
          Alert.alert('Ошибка', 'Сохраненный пароль не найден');
          setIsLoggingIn(false);
          return;
        }
      } else {
        passwordHash = await hashPassword(password);
      }

      // Send login request
      const response = await sendRequest('auth_login', {
        login: login.trim(),
        password_hash: passwordHash,
      });

      if (response.success) {
        // Save credentials if remember me is checked
        await saveCredentials(login.trim(), passwordHash, rememberMe);

        // Set user data
        setUser({
          id: response.user?.id,
          username: login.trim(),
          permissions: response.user?.permissions || {},
        });

        setStatusMessage('Авторизация успешна');
        router.replace('/main');
      } else {
        setStatusMessage('Ошибка авторизации');
        Alert.alert('Ошибка', response.error || 'Неверный логин или пароль');
      }
    } catch (error: any) {
      console.error('Login error:', error);
      setStatusMessage('Ошибка подключения');
      Alert.alert('Ошибка', error.message || 'Не удалось подключиться к серверу');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleServerChange = () => {
    setTempServerIp(serverConfig.ip);
    setTempServerPort(serverConfig.port);
    setShowServerDialog(true);
  };

  const saveServerSettings = () => {
    disconnect();
    setServerConfig({ ip: tempServerIp, port: tempServerPort });
    setShowServerDialog(false);
    // Will reconnect via useEffect
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        {/* Version number */}
        <Text style={styles.version}>ver.{VERSION}</Text>

        <View style={styles.formContainer}>
          {/* Login field */}
          <Text style={styles.label}>Login:</Text>
          <TextInput
            style={styles.input}
            value={login}
            onChangeText={setLogin}
            placeholder=""
            placeholderTextColor={COLORS.textGray}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />

          {/* Password field */}
          <Text style={styles.label}>Password:</Text>
          <TextInput
            ref={passwordRef}
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder=""
            placeholderTextColor={COLORS.textGray}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={handleLogin}
          />

          {/* Login button */}
          <TouchableOpacity
            style={[styles.button, (isLoggingIn || isConnecting) && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={isLoggingIn || isConnecting}
          >
            {isLoggingIn ? (
              <ActivityIndicator color={COLORS.background} />
            ) : (
              <Text style={styles.buttonText}>Enter</Text>
            )}
          </TouchableOpacity>

          {/* Remember me checkbox */}
          <TouchableOpacity
            style={styles.checkboxContainer}
            onPress={() => setRememberMe(!rememberMe)}
          >
            <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
              {rememberMe && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.checkboxLabel}>Запомнить меня</Text>
          </TouchableOpacity>

          {/* Server settings button */}
          <TouchableOpacity style={styles.serverButton} onPress={handleServerChange}>
            <Text style={styles.serverButtonText}>Сервер: {serverConfig.ip}:{serverConfig.port}</Text>
          </TouchableOpacity>
        </View>

        {/* Status bar */}
        <View style={styles.statusBar}>
          <View style={[styles.statusIndicator, isConnected ? styles.statusConnected : styles.statusDisconnected]} />
          <Text style={styles.statusText}>{statusMessage}</Text>
        </View>
      </KeyboardAvoidingView>

      {/* Server settings modal */}
      <Modal visible={showServerDialog} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Настройки сервера</Text>

            <Text style={styles.modalLabel}>IP адрес</Text>
            <TextInput
              style={styles.modalInput}
              value={tempServerIp}
              onChangeText={setTempServerIp}
              placeholder="192.168.0.56"
              placeholderTextColor={COLORS.textGray}
              keyboardType="default"
            />

            <Text style={styles.modalLabel}>Порт</Text>
            <TextInput
              style={styles.modalInput}
              value={tempServerPort}
              onChangeText={setTempServerPort}
              placeholder="8081"
              placeholderTextColor={COLORS.textGray}
              keyboardType="numeric"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setShowServerDialog(false)}
              >
                <Text style={styles.modalButtonText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSave]}
                onPress={saveServerSettings}
              >
                <Text style={styles.modalButtonText}>Сохранить</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  keyboardView: {
    flex: 1,
  },
  version: {
    position: 'absolute',
    top: 10,
    right: 16,
    color: COLORS.textWhite,
    fontSize: 14,
  },
  formContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  label: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: 'bold',
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 8,
  },
  input: {
    height: 48,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.inputBorder,
    color: COLORS.textWhite,
    fontSize: 18,
    paddingHorizontal: 8,
    marginBottom: 24,
  },
  button: {
    backgroundColor: COLORS.primary,
    height: 56,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: COLORS.background,
    fontSize: 20,
    fontWeight: 'bold',
    fontStyle: 'italic',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    justifyContent: 'center',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: COLORS.inputBorder,
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  checkmark: {
    color: COLORS.background,
    fontSize: 16,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    color: COLORS.textGray,
    fontSize: 16,
  },
  serverButton: {
    marginTop: 24,
    alignItems: 'center',
  },
  serverButtonText: {
    color: COLORS.textGray,
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: '#111',
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  statusConnected: {
    backgroundColor: '#44FF44',
  },
  statusDisconnected: {
    backgroundColor: '#FF4444',
  },
  statusText: {
    color: COLORS.textGray,
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#222',
    borderRadius: 8,
    padding: 24,
    width: '85%',
    maxWidth: 400,
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 24,
  },
  modalLabel: {
    color: COLORS.textGray,
    fontSize: 14,
    marginBottom: 8,
  },
  modalInput: {
    height: 44,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 4,
    color: COLORS.textWhite,
    fontSize: 16,
    paddingHorizontal: 12,
    marginBottom: 16,
    backgroundColor: '#333',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  modalButton: {
    flex: 1,
    height: 44,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 8,
  },
  modalButtonCancel: {
    backgroundColor: '#555',
  },
  modalButtonSave: {
    backgroundColor: COLORS.primary,
  },
  modalButtonText: {
    color: COLORS.textWhite,
    fontSize: 16,
    fontWeight: 'bold',
  },
});
