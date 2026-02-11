import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { useWebSocketContext } from '../context/WebSocketContext';
import { COLORS } from '../constants/theme';

interface MenuItem {
  id: string;
  title: string;
  badge?: number;
  route?: string;
  disabled?: boolean;
}

interface Operator {
  surname: string;
  name: string;
  department: string;
  login: string;
}

interface Engineer {
  id: string;
  fio: string;
  master_id: string;
}

interface Master {
  id: string;
  fio: string;
}

// Universal master - issues with this master are shown to all technicians
const UNIVERSAL_MASTER = 'Корень А. П.';

export default function MainScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { isConnected, addConnectionHandler, sendRequest } = useWebSocketContext();
  const [globalIssuesCount, setGlobalIssuesCount] = useState(0);
  const [statusMessage, setStatusMessage] = useState('Подключено');

  const menuItems: MenuItem[] = [
    { id: 'search', title: 'Поиск объектов', disabled: true },
    { id: 'globals', title: 'Глобальные неисправности', badge: globalIssuesCount, route: '/globals' },
    { id: 'maps', title: 'Карты', disabled: true },
    { id: 'requests', title: 'Заявки', disabled: true },
    { id: 'connections', title: 'Подключения', disabled: true },
    { id: 'options', title: 'Опции', disabled: true },
  ];

  useEffect(() => {
    // Subscribe to connection changes
    const removeHandler = addConnectionHandler((connected) => {
      setStatusMessage(connected ? 'Подключено' : 'Отключено от сервера');
    });

    return () => {
      removeHandler();
    };
  }, []);

  useEffect(() => {
    // Fetch global issues count
    if (isConnected) {
      fetchGlobalIssuesCount();
    }
  }, [isConnected]);

  // Helper function to extract "Фамилия И. О." -> "Фамилия И."
  const extractShortNameFromFIO = useCallback((fio: string): string => {
    const parts = fio.trim().split(/\s+/);
    if (parts.length >= 2) {
      // Return "Фамилия И." (first two parts)
      return `${parts[0]} ${parts[1]}`;
    }
    return fio.trim();
  }, []);

  // Convert login to "Фамилия И." format using operators list
  const getOperatorShortName = useCallback((login: string, operatorsList: Operator[]): string | null => {
    const operator = operatorsList.find(op => op.login === login);
    if (!operator) {
      return null;
    }
    // Create "Фамилия И." format from surname and name
    const firstInitial = operator.name ? `${operator.name.charAt(0)}.` : '';
    return `${operator.surname} ${firstInitial}`;
  }, []);

  const fetchGlobalIssuesCount = async () => {
    try {
      // Load all data in parallel
      const [issuesResponse, engineersResponse, mastersResponse, operatorsResponse] = await Promise.all([
        sendRequest('csv_read', { path: 'globals/issues.csv' }),
        sendRequest('list_engineers'),
        sendRequest('list_masters'),
        sendRequest('list_operators'),
      ]);

      if (!issuesResponse.success || !Array.isArray(issuesResponse.data)) {
        return;
      }

      const issues = issuesResponse.data;
      const engineers: Engineer[] = engineersResponse.success ? (engineersResponse.engineers || []) : [];
      const masters: Master[] = mastersResponse.success ? (mastersResponse.masters || []) : [];
      const operators: Operator[] = operatorsResponse.success ? (operatorsResponse.operators || []) : [];

      const login = user?.username || '';
      
      // Step 1: Get "Фамилия И." from login using operators
      const userShortName = getOperatorShortName(login, operators);
      
      if (!userShortName) {
        // If operator not found, count all open issues
        const openIssues = issues.filter((issue: any) =>
          !issue.decided || issue.decided === 'False' || issue.decided === 'false' || issue.decided === ''
        );
        setGlobalIssuesCount(openIssues.length);
        return;
      }

      // Step 2: Find engineer by matching "Фамилия И."
      const engineer = engineers.find((eng) => {
        const engShortName = extractShortNameFromFIO(eng.fio);
        return engShortName === userShortName;
      });

      if (!engineer) {
        // If engineer not found, count all open issues
        const openIssues = issues.filter((issue: any) =>
          !issue.decided || issue.decided === 'False' || issue.decided === 'false' || issue.decided === ''
        );
        setGlobalIssuesCount(openIssues.length);
        return;
      }

      // Step 3: Find master by master_id
      const master = masters.find((m) => m.id === engineer.master_id);
      const masterFio = master ? master.fio : '';

      // Step 4: Filter issues by master
      const filteredIssues = issues.filter((issue: any) => {
        const isOpen = !issue.decided || issue.decided === 'False' || issue.decided === 'false' || issue.decided === '';
        if (!isOpen) return false;

        const issueMaster = issue.master || '';
        return issueMaster === masterFio || issueMaster === UNIVERSAL_MASTER;
      });

      setGlobalIssuesCount(filteredIssues.length);
    } catch (error) {
      console.error('Error fetching global issues:', error);
    }
  };

  const handleMenuPress = (item: MenuItem) => {
    if (item.disabled) {
      Alert.alert('Информация', 'Этот раздел будет доступен в следующих версиях');
      return;
    }
    if (item.route) {
      router.push(item.route as any);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Выход',
      'Вы уверены, что хотите выйти?',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Выйти',
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/login');
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>NMS Client</Text>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={styles.logoutText}>Выход</Text>
        </TouchableOpacity>
      </View>

      {/* User info */}
      <View style={styles.userInfo}>
        <Text style={styles.userText}>Пользователь: {user?.username || 'Unknown'}</Text>
      </View>

      {/* Menu items */}
      <ScrollView style={styles.menuContainer} contentContainerStyle={styles.menuContent}>
        {menuItems.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[styles.menuButton, item.disabled && styles.menuButtonDisabled]}
            onPress={() => handleMenuPress(item)}
            activeOpacity={0.7}
          >
            <Text style={[styles.menuButtonText, item.disabled && styles.menuButtonTextDisabled]}>
              {item.title}
              {item.badge !== undefined && item.badge > 0 && ` (${item.badge})`}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Status bar */}
      <View style={styles.statusBar}>
        <View style={[styles.statusIndicator, isConnected ? styles.statusConnected : styles.statusDisconnected]} />
        <Text style={styles.statusText}>{statusMessage}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: 'bold',
  },
  logoutText: {
    color: COLORS.textGray,
    fontSize: 16,
  },
  userInfo: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#111',
  },
  userText: {
    color: COLORS.textGray,
    fontSize: 14,
  },
  menuContainer: {
    flex: 1,
  },
  menuContent: {
    padding: 16,
  },
  menuButton: {
    backgroundColor: COLORS.primary,
    height: 70,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#666',
  },
  menuButtonDisabled: {
    opacity: 0.5,
  },
  menuButtonText: {
    color: COLORS.background,
    fontSize: 18,
    fontWeight: 'bold',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  menuButtonTextDisabled: {
    color: '#333',
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: '#111',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
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
});
