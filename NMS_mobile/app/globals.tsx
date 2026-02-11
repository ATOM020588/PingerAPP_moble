import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { useWebSocketContext } from '../context/WebSocketContext';

interface GlobalIssue {
  id: string;
  date: string;
  description: string;
  tickets: string;
  master: string;
  executor: string;
  severity_type: string;
  device_type: string;
  device_id: string;
  decided: boolean | string;
  solution?: string;
  created?: string;
  transferred?: string;
  callback?: string;
  work_start?: string;
  call_history?: string;
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

interface Operator {
  surname: string;
  name: string;
  department: string;
  login: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  'Чрезвычайная': COLORS.severity.critical,
  'Высокая': COLORS.severity.high,
  'Средняя': COLORS.severity.medium,
  'Предупреждение': COLORS.severity.low,
  'Информация': COLORS.severity.info,
  'Support': COLORS.severity.support,
  'default': COLORS.textGray,
};

// Universal master - issues with this master are shown to all technicians
const UNIVERSAL_MASTER = 'Корень А. П.';

export default function GlobalsScreen() {
  const router = useRouter();
  const { isConnected, sendRequest, addConnectionHandler } = useWebSocketContext();
  const { user } = useAuth();

  const [allIssues, setAllIssues] = useState<GlobalIssue[]>([]);
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [masters, setMasters] = useState<Master[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<GlobalIssue | null>(null);
  const [statusMessage, setStatusMessage] = useState('Загрузка...');
  const [userMasterFio, setUserMasterFio] = useState<string | null>(null);

  useEffect(() => {
    // Subscribe to connection changes
    const removeHandler = addConnectionHandler((connected) => {
      if (connected) {
        setStatusMessage('Подключено');
        loadAllData();
      } else {
        setStatusMessage('Отключено от сервера');
      }
    });

    // Load data on mount if connected
    if (isConnected) {
      loadAllData();
    }

    return () => {
      removeHandler();
    };
  }, []);

  // Helper function to extract "Фамилия И. О." -> "Фамилия И."
  const extractShortName = useCallback((fio: string): string => {
    const parts = fio.trim().split(/\s+/);
    if (parts.length >= 2) {
      // Return "Фамилия И." (first two parts: surname + first initial)
      return `${parts[0]} ${parts[1]}`;
    }
    return fio.trim();
  }, []);

  // Convert login to "Фамилия И." format using operators list
  const getOperatorShortName = useCallback((login: string, operatorsList: Operator[]): string | null => {
    const operator = operatorsList.find(op => op.login === login);
    if (!operator) {
      console.log(`Operator not found for login: ${login}`);
      return null;
    }
    // Create "Фамилия И." format from surname and name
    const firstInitial = operator.name ? `${operator.name.charAt(0)}.` : '';
    const shortName = `${operator.surname} ${firstInitial}`;
    console.log(`Found operator: ${operator.surname} ${operator.name} -> ${shortName}`);
    return shortName;
  }, []);

  // Find user's master based on login
  const findUserMaster = useCallback((
    login: string, 
    operatorsList: Operator[],
    engineersList: Engineer[], 
    mastersList: Master[]
  ): string | null => {
    if (!login || operatorsList.length === 0 || engineersList.length === 0 || mastersList.length === 0) {
      return null;
    }

    // Step 1: Get "Фамилия И." from login using operators
    const userShortName = getOperatorShortName(login, operatorsList);
    if (!userShortName) {
      return null;
    }

    // Step 2: Find engineer by matching "Фамилия И." from engineer's fio
    const engineer = engineersList.find((eng) => {
      const engShortName = extractShortName(eng.fio);
      return engShortName === userShortName;
    });

    if (!engineer) {
      console.log(`Engineer not found for short name: ${userShortName}`);
      return null;
    }

    console.log(`Found engineer: ${engineer.fio} with master_id: ${engineer.master_id}`);

    // Step 3: Find master by master_id
    const master = mastersList.find((m) => m.id === engineer.master_id);

    if (!master) {
      console.log(`Master not found for master_id: ${engineer.master_id}`);
      return null;
    }

    console.log(`Found master: ${master.fio}`);
    return master.fio;
  }, [extractShortName, getOperatorShortName]);

  const loadAllData = async () => {
    try {
      setStatusMessage('Загрузка данных...');

      // Load all data in parallel
      const [issuesResponse, engineersResponse, mastersResponse, operatorsResponse] = await Promise.all([
        sendRequest('csv_read', { path: 'globals/issues.csv' }),
        sendRequest('list_engineers'),
        sendRequest('list_masters'),
        sendRequest('list_operators'),
      ]);

      // Process issues
      if (issuesResponse.success && Array.isArray(issuesResponse.data)) {
        setAllIssues(issuesResponse.data);
      }

      // Process engineers
      const engineersList = engineersResponse.success ? (engineersResponse.engineers || []) : [];
      setEngineers(engineersList);

      // Process masters
      const mastersList = mastersResponse.success ? (mastersResponse.masters || []) : [];
      setMasters(mastersList);

      // Process operators
      const operatorsList = operatorsResponse.success ? (operatorsResponse.operators || []) : [];
      setOperators(operatorsList);

      // Find user's master using login
      const login = user?.username || '';
      const masterFio = findUserMaster(login, operatorsList, engineersList, mastersList);
      setUserMasterFio(masterFio);

      console.log(`User login: ${login}, Master: ${masterFio}`);

      setStatusMessage(`Загружено ${issuesResponse.data?.length || 0} записей`);
    } catch (error) {
      console.error('Error loading data:', error);
      setStatusMessage('Ошибка загрузки данных');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadAllData();
  };

  const isDecided = (decided: boolean | string): boolean => {
    if (typeof decided === 'boolean') return decided;
    if (typeof decided === 'string') {
      return decided.toLowerCase() === 'true' || decided === '1';
    }
    return false;
  };

  // Filter issues based on user's master
  const filteredIssues = useMemo(() => {
    let result = allIssues;

    // Filter by master (main filtering logic)
    if (userMasterFio) {
      result = result.filter(issue => {
        const issueMaster = issue.master || '';
        // Show issue if:
        // 1. Issue's master matches user's master
        // 2. OR issue's master is "Корень А. П." (universal master - shown to all)
        return issueMaster === userMasterFio || issueMaster === UNIVERSAL_MASTER;
      });
    }
    // If userMasterFio is null (engineer not found), show all issues as fallback

    // Filter by open/closed status
    if (!showClosed) {
      result = result.filter(issue => !isDecided(issue.decided));
    }

    // Sort by date (newest first)
    result.sort((a, b) => {
      const dateA = new Date(a.date || 0).getTime();
      const dateB = new Date(b.date || 0).getTime();
      return dateB - dateA;
    });

    return result;
  }, [allIssues, showClosed, userMasterFio]);

  // Count for display (filtered issues)
  const openCount = useMemo(() => {
    let result = allIssues;

    // Apply master filter
    if (userMasterFio) {
      result = result.filter(issue => {
        const issueMaster = issue.master || '';
        return issueMaster === userMasterFio || issueMaster === UNIVERSAL_MASTER;
      });
    }

    // Count only open issues
    return result.filter(i => !isDecided(i.decided)).length;
  }, [allIssues, userMasterFio]);

  const totalCount = useMemo(() => {
    if (!userMasterFio) return allIssues.length;

    return allIssues.filter(issue => {
      const issueMaster = issue.master || '';
      return issueMaster === userMasterFio || issueMaster === UNIVERSAL_MASTER;
    }).length;
  }, [allIssues, userMasterFio]);

  const getSeverityColor = (severity: string): string => {
    if (!severity) return SEVERITY_COLORS.default;
    return SEVERITY_COLORS[severity] || SEVERITY_COLORS.default;
  };

  const formatDate = (dateStr: string): string => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const renderIssueItem = ({ item }: { item: GlobalIssue }) => {
    const severityColor = getSeverityColor(item.severity_type);
    const decided = isDecided(item.decided);

    return (
      <TouchableOpacity
        style={styles.issueCard}
        onPress={() => setSelectedIssue(item)}
        activeOpacity={0.7}
      >
        <View style={styles.issueHeader}>
          <View style={[styles.severityIndicator, { backgroundColor: severityColor }]} />
          <Text style={[styles.issueDate, { color: severityColor }]}>
            {formatDate(item.date)}
          </Text>
          {decided && (
            <View style={styles.decidedBadge}>
              <Text style={styles.decidedText}>Закрыто</Text>
            </View>
          )}
        </View>

        <Text style={styles.issueDescription} numberOfLines={10}>
          {item.description || 'Без описания'}
        </Text>

        <View style={styles.issueFooter}>
          {item.master && (
            <Text style={styles.issueMaster}>Мастер: {item.master}</Text>
          )}
          {item.tickets && (
            <Text style={styles.issueTickets}>Заявки: {item.tickets}</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderDetailModal = () => {
    if (!selectedIssue) return null;

    const detailItems = [
      { label: 'Описание', value: selectedIssue.description },
      { label: 'История событий', value: selectedIssue.call_history },
      { label: 'Важность', value: selectedIssue.severity_type },
      { label: 'Мастер', value: selectedIssue.master },
      { label: 'Исполнитель', value: selectedIssue.executor },
      { label: 'Заявки', value: selectedIssue.tickets },
      //{ label: 'ID устройства', value: selectedIssue.device_id },
      { label: 'Создано', value: formatDate(selectedIssue.created || '') },
      { label: 'Решено', value: selectedIssue.solution },
    ].filter(item => item.value);

    return (
      <Modal visible={!!selectedIssue} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Детали неисправности</Text>
              <TouchableOpacity onPress={() => setSelectedIssue(null)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={detailItems}
              renderItem={({ item }) => (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{item.label}:</Text>
                  <Text style={styles.detailValue}>{item.value || '-'}</Text>
                </View>
              )}
              keyExtractor={(item) => item.label}
            />
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← </Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Глобальные неисправности</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Master info */}
      {userMasterFio && (
        <View style={styles.masterInfo}>
          <Text style={styles.masterInfoText}>Мастер: {userMasterFio}</Text>
        </View>
      )}

      {/* Filter buttons */}
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterButton, !showClosed && styles.filterButtonActive]}
          onPress={() => setShowClosed(false)}
        >
          <Text style={[styles.filterText, !showClosed && styles.filterTextActive]}>
            Открытые ({openCount})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, showClosed && styles.filterButtonActive]}
          onPress={() => setShowClosed(true)}
        >
          <Text style={[styles.filterText, showClosed && styles.filterTextActive]}>
            Все ({totalCount})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Issues list */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Загрузка...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredIssues}
          renderItem={renderIssueItem}
          keyExtractor={(item) => item.id || Math.random().toString()}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {showClosed ? 'Нет записей' : 'Нет открытых неисправностей'}
              </Text>
            </View>
          }
        />
      )}

      {/* Status bar */}
      <View style={styles.statusBar}>
        <View style={[styles.statusIndicator, isConnected ? styles.statusConnected : styles.statusDisconnected]} />
        <Text style={styles.statusText}>{statusMessage}</Text>
      </View>

      {/* Detail modal */}
      {renderDetailModal()}
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
  backButton: {
    paddingVertical: 4,
  },
  backText: {
    color: COLORS.text,
    fontSize: 20,
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerRight: {
    width: 60,
  },
  masterInfo: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  masterInfoText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '500',
  },
  filterContainer: {
    flexDirection: 'row',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginHorizontal: 4,
    borderRadius: 4,
    backgroundColor: '#222',
    alignItems: 'center',
  },
  filterButtonActive: {
    backgroundColor: COLORS.primary,
  },
  filterText: {
    color: COLORS.textGray,
    fontSize: 14,
    fontWeight: '500',
  },
  filterTextActive: {
    color: COLORS.background,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: COLORS.textGray,
    marginTop: 12,
    fontSize: 16,
  },
  listContent: {
    padding: 12,
  },
  issueCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  issueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  severityIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  issueDate: {
    fontSize: 14,
    fontWeight: 'bold',
    flex: 1,
  },
  decidedBadge: {
    backgroundColor: '#006600',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  decidedText: {
    color: COLORS.textWhite,
    fontSize: 12,
  },
  issueDescription: {
    color: COLORS.textWhite,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 8,
  },
  issueFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  issueMaster: {
    color: COLORS.textGray,
    fontSize: 13,
  },
  issueTickets: {
    color: COLORS.textGray,
    fontSize: 13,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: COLORS.textGray,
    fontSize: 16,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '80%',
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalClose: {
    color: COLORS.textGray,
    fontSize: 24,
    padding: 4,
  },
  detailRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  detailLabel: {
    color: COLORS.textGray,
    fontSize: 13,
    marginBottom: 4,
  },
  detailValue: {
    color: COLORS.textWhite,
    fontSize: 15,
  },
});
