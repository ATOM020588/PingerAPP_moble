import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../constants/theme';
import { useWebSocketContext } from '../context/WebSocketContext';

interface Port {
  number: string;
  label?: string;
  description: string;
  color?: string;
  bold?: boolean;
  status?: string;
}

interface SwitchData {
  id: string;
  name: string;
  ip?: string;
  model?: string;
  mac?: string;
  pingok?: boolean;
  power?: string;
  master?: string;
  uptime?: string;
  ping_time?: string;
  other?: string;
  ports?: Port[];
}

export default function SwitchInfoScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ switchId: string; mapPath: string }>();
  const { isConnected, sendRequest } = useWebSocketContext();

  const [switchData, setSwitchData] = useState<SwitchData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isConnected && params.mapPath && params.switchId) {
      loadSwitchData();
    }
  }, [params.switchId, params.mapPath, isConnected]);

  const loadSwitchData = async () => {
    try {
      setIsLoading(true);

      // Загружаем карту для получения данных свитча
      const response = await sendRequest('file_get', {
        path: params.mapPath,
      });

      if (response.success && response.data) {
        const switches = response.data.switches || [];
        const switchInfo = switches.find((s: any) => s.id === params.switchId);

        if (switchInfo) {
          setSwitchData(switchInfo);
        }
      }
    } catch (error) {
      console.error('Error loading switch data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = () => {
    loadSwitchData();
  };

  // Определяет, является ли устройство OLT
  const isOltDevice = (model?: string): boolean => {
    if (!model) return false;
    const modelLower = model.toLowerCase();
    const oltKeywords = ['olt', 'bdcom', 'p3600', 'epon', 'gpon', 'pon'];
    return oltKeywords.some(keyword => modelLower.includes(keyword));
  };

  // Константы цветов для подписей портов
  const PORT_DESCRIPTION_COLORS = {
    default: '#FFFFFF',        // Белый - по умолчанию
    active: '#00FF00',         // Зеленый - активный порт
    inactive: '#808080',       // Серый - неактивный порт
    error: '#FF0000',          // Красный - ошибка
    warning: '#FFA500',        // Оранжевый - предупреждение
    info: '#00FFFF',           // Голубой - информация
    disabled: '#666666',       // Темно-серый - отключен
  };

  // Функция определения цвета подписи порта
  const getPortDescriptionColor = (port: Port): string => {
    // Приоритет 1: Цвет из файла карты (если указан)
    if (port.color) {
      return port.color;
    }

    // Приоритет 2: Цвет на основе статуса порта (можно настроить)
    if (port.status) {
      const status = port.status.toLowerCase();
      if (status === 'up' || status === 'online' || status === '1') {
        // return PORT_DESCRIPTION_COLORS.active; // Раскомментировать для автоматической подсветки активных
      } else if (status === 'down' || status === 'offline' || status === '0' || status === '2') {
        // return PORT_DESCRIPTION_COLORS.inactive; // Раскомментировать для автоматической подсветки неактивных
      }
    }

    // Приоритет 3: Цвет по умолчанию
    return PORT_DESCRIPTION_COLORS.default;
  };

  const renderHeader = () => {
    if (!switchData) return null;

    const pingStatus = switchData.pingok ? 'UP' : 'DOWN';
    const pingColor = switchData.pingok ? '#4CAF50' : '#F44336';

    return (
      <View style={styles.headerInfo}>
        <View style={styles.headerDetails}>
          <Text style={styles.headerLabel}>IP</Text>
          <Text style={styles.headerValue}>{switchData.ip || '—'}</Text>

          <Text style={styles.headerLabel}>Статус пинга</Text>
          <Text style={[styles.headerValue, { color: pingColor }]}>{pingStatus}</Text>

          {switchData.mac && (
            <>
              <Text style={styles.headerLabel}>MAC</Text>
              <Text style={styles.headerValue}>{switchData.mac}</Text>
            </>
          )}
        </View>
      </View>
    );
  };

  const renderPorts = () => {
    if (!switchData?.ports || switchData.ports.length === 0) {
      return (
        <View style={styles.noPortsContainer}>
          <Text style={styles.noPortsText}>Нет данных о портах</Text>
        </View>
      );
    }

    // Проверяем, является ли это OLT устройством
    const isOlt = isOltDevice(switchData.model);

    return (
      <View style={styles.portsContainer}>
        <View style={styles.portsHeader}>
          <Text style={[styles.portsHeaderText, styles.portNumberCol]}>Порт</Text>
          <Text style={[styles.portsHeaderText, styles.portStatusCol]}>Акт.</Text>
          <Text style={[styles.portsHeaderText, styles.portDescCol]}>Подпись</Text>
        </View>

        {switchData.ports.map((port, index) => {
          // Определяем цвет номера порта по статусу
          let portColor = '#FFA500'; // Оранжевый - unknown по умолчанию
          
          if (port.status) {
            const status = port.status.toLowerCase();
            if (status === 'up' || status === 'online' || status === '1') {
              portColor = '#00A000'; // Зелёный - up/online
            } else if (status === 'down' || status === 'offline' || status === '2' || status === '0') {
              portColor = '#C90000'; // Красный - down/offline
            }
          } else if (switchData.pingok !== undefined) {
            // Если нет статуса, используем pingok свитча
            portColor = switchData.pingok ? '#00A000' : '#C90000';
          }

          const portStatus = port.status || (switchData.pingok ? '(1)' : '(0)');
          
          // Цвет подписи берём из файла карты, по умолчанию белый
          const descriptionColor = port.color || '#FFFFFF';

          // Для OLT используем label, для обычных свитчей - number
          const portNumber = isOlt && port.label ? port.label : port.number;

          return (
            <View key={index} style={styles.portRow}>
              <Text style={[styles.portNumber, { color: portColor }]}>
                {portNumber}
              </Text>
              <Text style={[styles.portStatus, { color: portColor }]}>
                {portStatus}
              </Text>
              <Text
                style={[
                  styles.portDesc,
                  { 
                    fontWeight: port.bold ? 'bold' : 'normal',
                    color: descriptionColor,
                  },
                ]}
                numberOfLines={2}
              >
                {port.description || ''}
              </Text>
            </View>
          );
        })}
      </View>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Загрузка...</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!switchData) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Ошибка</Text>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>Не удалось загрузить данные</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {switchData.name}
        </Text>
        <TouchableOpacity style={styles.updateButton} onPress={handleRefresh}>
          <Text style={styles.updateButtonText}>Обновить</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Header info */}
        {renderHeader()}

        {/* Информация о свитче */}
        <View style={styles.infoSection}>
          {switchData.model && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Модель:</Text>
              <Text style={styles.infoValue}>{switchData.model}</Text>
            </View>
          )}

          {switchData.uptime && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Uptime:</Text>
              <Text style={styles.infoValue}>{switchData.uptime}</Text>
            </View>
          )}

          {switchData.power && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Питание:</Text>
              <Text style={styles.infoValue}>{switchData.power}</Text>
            </View>
          )}
        </View>

        {/* Порты */}
        {renderPorts()}

        {/* Примечание */}
        {switchData.other && (
          <View style={styles.noteSection}>
            <Text style={styles.noteTitle}>Примечание:</Text>
            <Text style={styles.noteText}>{switchData.other}</Text>
          </View>
        )}
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.footerButton} onPress={() => router.back()}>
          <Text style={styles.footerButtonText}>На карту</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    backgroundColor: '#111',
  },
  backButton: {
    paddingVertical: 4,
    paddingRight: 8,
  },
  backText: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: 'bold',
  },
  headerTitle: {
    color: '#FFC107',
    fontSize: 16,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  updateButton: {
    backgroundColor: '#FFC107',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  updateButtonText: {
    color: '#000',
    fontSize: 12,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#F44336',
    fontSize: 16,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 12,
  },
  headerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#111',
    borderRadius: 4,
    marginBottom: 12,
  },
  headerDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    flex: 1,
    gap: 8,
  },
  headerLabel: {
    color: '#888',
    fontSize: 12,
  },
  headerValue: {
    color: '#FFC107',
    fontSize: 12,
    fontWeight: 'bold',
    marginRight: 16,
  },
  infoSection: {
    backgroundColor: '#111',
    borderRadius: 4,
    padding: 12,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    paddingVertical: 4,
  },
  infoLabel: {
    color: '#FFC107',
    fontSize: 12,
    marginRight: 8,
  },
  infoValue: {
    color: '#FFC107',
    fontSize: 12,
    flex: 1,
  },
  portsContainer: {
    backgroundColor: '#ffffe1',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  portsHeader: {
    flexDirection: 'row',
    backgroundColor: '#333',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#555',
  },
  portsHeaderText: {
    color: '#FFC107',
    fontSize: 12,
    fontWeight: 'bold',
  },
  portNumberCol: {
    width: 60,
  },
  portStatusCol: {
    width: 60,
  },
  portDescCol: {
    flex: 1,
  },
  portRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    minHeight: 22,
    alignItems: 'center',
  },
  noPortsContainer: {
    backgroundColor: '#ffffe1',
    padding: 24,
    borderRadius: 4,
    alignItems: 'center',
  },
  noPortsText: {
    color: '#666',
    fontSize: 14,
  },
  portNumber: {
    fontSize: 12,
    fontWeight: 'bold',
    width: 60,
  },
  portStatus: {
    fontSize: 12,
    width: 60,
  },
  portDesc: {
    fontSize: 12,
    color: '#000',
    flex: 1,
  },
  noteSection: {
    backgroundColor: '#3a3a3a',
    borderRadius: 4,
    padding: 12,
    borderWidth: 1,
    borderColor: '#555',
  },
  noteTitle: {
    color: '#FFC107',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  noteText: {
    color: '#FFC107',
    fontSize: 12,
  },
  footer: {
    padding: 12,
    backgroundColor: '#111',
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  footerButton: {
    backgroundColor: '#FFC107',
    paddingVertical: 12,
    borderRadius: 4,
    alignItems: 'center',
  },
  footerButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
