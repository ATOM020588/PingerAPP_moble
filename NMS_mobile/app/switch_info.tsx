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
// Путь: switch_info.tsx в /app/, WebSocketContext в /context/
import { useWebSocketContext } from '../context/WebSocketContext';

// =====================================================
// ВКЛЮЧИТЬ/ВЫКЛЮЧИТЬ DEBUG РЕЖИМ
// =====================================================
const DEBUG_ENABLED = true;

const debugLog = (message: string, data?: any) => {
  if (DEBUG_ENABLED) {
    if (data !== undefined) {
      console.log(`[DEBUG:switch_info] ${message}`, JSON.stringify(data, null, 2));
    } else {
      console.log(`[DEBUG:switch_info] ${message}`);
    }
  }
};

// =====================================================
// МАППИНГ ЦВЕТОВ ПОДПИСЕЙ ПОРТОВ
// Измените значения справа для замены цветов
// Формат: 'исходный_цвет': 'новый_цвет'
// =====================================================
const PORT_LABEL_COLOR_MAP: Record<string, string> = {
  // Магистральный порт - Чёрный
  '#000000': '#000000',
  // Uplink - Синий
  '#0000BE': '#0000BE',
  // Корпоративщик - Пурпурный/Маджента
  '#FF00FF': '#FF00FF',
  // Маг. с корп. - Синий
  '#0000FF': '#0000FF',
  // Проблема - Красный
  '#FF0000': '#FF0000',
  // Отключен - Тёмно-оранжевый
  '#FF8C00': '#FF8C00',
  // Сотрудник - Голубой
  '#0080FF': '#0080FF',
  // Питающий - Фиолетовый
  '#8000FF': '#8000FF',
  // Дополнительные цвета
  '#00FF00': '#00FF00',   // Зелёный
  '#FFFF00': '#FFFF00',   // Жёлтый
  '#FFA500': '#FFA500',   // Оранжевый
  '#FF8040': '#FF8040',   // Светло-оранжевый (ОТКЛ)
  '#D700D7': '#D700D7',   // Пурпурный (корпоратив)
  '#00FFFF': '#00FFFF',   // Голубой/Циан
  '#FFFFFF': '#FFFFFF',   // Белый
};

// Функция для получения заменённого цвета
const getMappedColor = (originalColor: string | undefined): string => {
  if (!originalColor) return '#FFFFFF'; // По умолчанию белый
  const upperColor = originalColor.toUpperCase();
  return PORT_LABEL_COLOR_MAP[upperColor] || originalColor;
};
// =====================================================

interface Port {
  number: string;
  id?: string;        // ifindex для OLT устройств
  port_id?: string;   // ifindex для MES устройств (1124MB, 2324B, 2324FB, 3324F)
  label?: string;
  description: string;
  color?: string;
  bold?: boolean;
  status?: string;
  mac_count?: number;
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

interface SnmpPort {
  number: number;
  id?: string;        // ifindex
  status: string;
  status_text: string;
  speed?: string;
  duplex?: string;
  mac_count?: number;
}

interface SnmpPollResult {
  success: boolean;
  error?: string;
  data?: {
    uptime?: string;
    uptime_formatted?: string;
    ports?: SnmpPort[];
    port_statuses_raw?: Record<string, string>;  // Словарь: номер порта -> статус
    mac_counts?: Record<string, number>;         // Словарь: номер порта -> кол-во MAC
    ip?: string;
    model?: string;
  };
}

// =====================================================
// ОПРЕДЕЛЕНИЕ ТИПА УСТРОЙСТВА
// =====================================================

// Определяет, является ли устройство OLT
const isOltDevice = (model?: string): boolean => {
  if (!model) return false;
  const modelLower = model.toLowerCase();
  const oltKeywords = ['olt', 'bdcom', 'p3600', 'epon', 'gpon', 'pon'];
  return oltKeywords.some(keyword => modelLower.includes(keyword));
};

// Определяет, является ли устройство MES с port_id маппингом
// MES 1124MB, MES 2324B, MES2324FB, MES-3324F используют port_id -> ifindex
const isMesWithPortId = (model?: string): boolean => {
  if (!model) return false;
  const modelUpper = model.toUpperCase();
  // Проверяем модели MES которые используют port_id
  const mesModels = [
    'MES-1124MB', 'MES1124MB',
    'MES-2324B', 'MES2324B',
    'MES-2324FB', 'MES2324FB',
    'MES-3324F', 'MES3324F',
    'MES-2324', 'MES2324',
    'MES-3324', 'MES3324',
  ];
  return mesModels.some(m => modelUpper.includes(m.replace('-', '')));
};

// =====================================================
// ИЗВЛЕЧЕНИЕ IFINDEX ИЗ НОМЕРА ПОРТА OLT
// Формат: "{ifindex}0/slot:port" -> извлекаем ifindex из фигурных скобок
// =====================================================
const extractOltIfindex = (portNumber: string): string | null => {
  const match = portNumber.match(/^\{(\d+)\}/);
  if (match) {
    return match[1];
  }
  return null;
};

export default function SwitchInfoScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ switchId: string; mapPath: string }>();
  const { isConnected, sendRequest } = useWebSocketContext();

  const [switchData, setSwitchData] = useState<SwitchData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [snmpUptime, setSnmpUptime] = useState<string | null>(null);

  useEffect(() => {
    if (isConnected && params.mapPath && params.switchId) {
      loadSwitchData();
    }
  }, [params.switchId, params.mapPath, isConnected]);

  const loadSwitchData = async () => {
    try {
      setIsLoading(true);
      debugLog('Loading switch data', { switchId: params.switchId, mapPath: params.mapPath });

      // Загружаем карту для получения данных свитча
      const response = await sendRequest('file_get', {
        path: params.mapPath,
      });

      if (response.success && response.data) {
        const switches = response.data.switches || [];
        const switchInfo = switches.find((s: SwitchData) => s.id === params.switchId);

        if (switchInfo) {
          debugLog('Switch data loaded', {
            name: switchInfo.name,
            model: switchInfo.model,
            ip: switchInfo.ip,
            portsCount: switchInfo.ports?.length,
            isOlt: isOltDevice(switchInfo.model),
            isMesWithPortId: isMesWithPortId(switchInfo.model),
          });
          
          // Логируем первые несколько портов для отладки
          if (switchInfo.ports && switchInfo.ports.length > 0) {
            debugLog('Sample ports from map:', switchInfo.ports.slice(0, 3).map((p: Port) => ({
              number: p.number,
              id: p.id,
              port_id: p.port_id,
              description: p.description?.substring(0, 30),
            })));
          }
          
          setSwitchData(switchInfo);
        } else {
          debugLog('Switch not found in map');
        }
      }
    } catch (error) {
      console.error('Error loading switch data:', error);
      debugLog('Error loading switch data', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Обновление данных через SNMP
  const handleRefresh = async () => {
    if (!switchData?.ip || !switchData?.model) {
      debugLog('No IP or model, reloading from file');
      // Если нет IP или модели, просто перезагружаем данные из файла
      loadSwitchData();
      return;
    }

    try {
      setIsRefreshing(true);
      debugLog('Starting SNMP poll', { ip: switchData.ip, model: switchData.model });

      // Вызываем SNMP poll на сервере
      const snmpResponse = await sendRequest<SnmpPollResult>('snmp_poll', {
        ip: switchData.ip,
        model: switchData.model,
      });

      debugLog('SNMP response received', {
        success: snmpResponse.success,
        hasData: !!snmpResponse.data,
        dataKeys: snmpResponse.data ? Object.keys(snmpResponse.data) : [],
        portsCount: snmpResponse.data?.ports?.length,
        hasPortStatusesRaw: !!snmpResponse.data?.port_statuses_raw,
        portStatusesRawKeys: snmpResponse.data?.port_statuses_raw ? Object.keys(snmpResponse.data.port_statuses_raw).slice(0, 10) : [],
        hasMacCounts: !!snmpResponse.data?.mac_counts,
        uptime: snmpResponse.data?.uptime_formatted,
        error: snmpResponse.error,
      });

      if (snmpResponse.success && snmpResponse.data) {
        const responseData = snmpResponse.data;
        
        // Обновляем uptime из SNMP
        if (responseData.uptime_formatted) {
          setSnmpUptime(responseData.uptime_formatted);
        }

        // Обновляем статусы портов из SNMP
        if (switchData.ports) {
          const isOlt = isOltDevice(switchData.model);
          const isMes = isMesWithPortId(switchData.model);
          
          // Получаем словари статусов и MAC-адресов из data
          const portStatusesRaw = responseData.port_statuses_raw || {};
          const macCounts = responseData.mac_counts || {};

          debugLog('Device type detection', { 
            isOlt, 
            isMes, 
            model: switchData.model,
            usePortStatusesRaw: Object.keys(portStatusesRaw).length > 0,
          });

          // Логируем примеры статусов из port_statuses_raw
          if (Object.keys(portStatusesRaw).length > 0) {
            const sampleStatuses: Record<string, string> = {};
            Object.keys(portStatusesRaw).slice(0, 10).forEach(k => {
              sampleStatuses[k] = portStatusesRaw[k];
            });
            debugLog('Sample port_statuses_raw:', sampleStatuses);
          }

          const updatedPorts = switchData.ports.map((port: Port) => {
            let portStatus: string | undefined;
            let portMacCount: number | undefined;
            let matchKey: string = '';

            if (isOlt) {
              // Для OLT: извлекаем ifindex из номера порта формата "{ifindex}0/slot:port"
              // или используем port.id если есть
              const oltIfindex = extractOltIfindex(port.number);
              const portIfindex = oltIfindex || port.id;
              
              if (portIfindex) {
                portStatus = portStatusesRaw[portIfindex];
                portMacCount = macCounts[portIfindex];
                matchKey = `OLT ifindex=${portIfindex}`;
              }
            } else if (isMes && port.port_id) {
              // Для MES (1124MB, 2324B, 2324FB, 3324F) с port_id: port_id -> ifindex
              portStatus = portStatusesRaw[port.port_id];
              portMacCount = macCounts[port.port_id];
              matchKey = `MES port_id=${port.port_id}`;
            } else {
              // Для обычных свитчей и MES без port_id: number -> номер порта
              // Очищаем номер порта от суффиксов типа "м" (например "17м" -> "17")
              const cleanNumber = port.number.replace(/[^\d]/g, '');
              
              // Пробуем найти статус по очищенному номеру или по оригинальному
              portStatus = portStatusesRaw[cleanNumber] || portStatusesRaw[port.number];
              portMacCount = macCounts[cleanNumber] || macCounts[port.number];
              matchKey = `Regular number=${port.number} (clean=${cleanNumber})`;
            }

            if (portStatus !== undefined) {
              debugLog(`Port matched: ${matchKey}`, {
                portNumber: port.number,
                status: portStatus,
                macCount: portMacCount,
              });
              return {
                ...port,
                status: portStatus,
                mac_count: portMacCount,
              };
            } else {
              // Только логируем первые несколько несовпадений
              debugLog(`Port NOT matched: ${matchKey}`, {
                portNumber: port.number,
                port_id: port.port_id,
                id: port.id,
              });
            }
            return port;
          });

          setSwitchData(prev => prev ? { ...prev, ports: updatedPorts } : null);
        }
      } else {
        debugLog('SNMP poll failed', snmpResponse.error);
        // При ошибке SNMP просто перезагружаем из файла
        await loadSwitchData();
      }
    } catch (error) {
      console.error('Error refreshing via SNMP:', error);
      debugLog('Error refreshing via SNMP', error);
      // При ошибке перезагружаем из файла
      await loadSwitchData();
    } finally {
      setIsRefreshing(false);
    }
  };

  const renderHeader = () => {
    if (!switchData) return null;

    const pingStatus = switchData.pingok ? 'UP' : 'DOWN';
    const pingColor = switchData.pingok ? '#4CAF50' : '#F44336';
    const displayUptime = snmpUptime || switchData.uptime;

    return (
      <View style={styles.headerInfo}>
        <View style={styles.headerDetails}>
          {/* Первая строка: IP и Статус пинга */}
          <View style={styles.headerRow}>
            <Text style={styles.headerLabel}>IP:</Text>
            <Text style={styles.headerValue}>{switchData.ip || '—'}</Text>
            <Text style={styles.headerLabel}>Статус:</Text>
            <Text style={[styles.headerValue, { color: pingColor }]}>{pingStatus}</Text>
          </View>

          {/* Вторая строка: MAC и Uptime */}
          <View style={styles.headerRow}>
            {switchData.mac && (
              <>
                <Text style={styles.headerLabel}>MAC:</Text>
                <Text style={styles.headerValue}>{switchData.mac}</Text>
              </>
            )}
            {displayUptime && (
              <>
                <Text style={styles.headerLabel}>Uptime:</Text>
                <Text style={styles.headerValue}>{displayUptime}</Text>
              </>
            )}
          </View>
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

    // Проверяем тип устройства
    const isOlt = isOltDevice(switchData.model);

    return (
      <View style={styles.portsContainer}>
        <View style={styles.portsHeader}>
          <Text style={[styles.portsHeaderText, styles.portNumberCol]}>Порт</Text>
          <Text style={[styles.portsHeaderText, styles.portStatusCol]}>Акт.</Text>
          <Text style={[styles.portsHeaderText, styles.portDescCol]}>Подпись</Text>
        </View>

        {switchData.ports.map((port: Port, index: number) => {
          // =====================================================
          // ОПРЕДЕЛЕНИЕ ЦВЕТА СТАТУСА ПОРТА
          // =====================================================
          // По умолчанию - чёрный (статус неизвестен)
          let portColor = '#000000';
          let portStatusText = '—'; // По умолчанию прочерк

          if (port.status !== undefined && port.status !== null && port.status !== '') {
            const status = String(port.status).toLowerCase();
            
            if (status === 'up' || status === 'online' || status === '1') {
              portColor = '#00A000'; // Зелёный - up/online
              portStatusText = '(1)';
            } else if (status === 'down' || status === 'offline' || status === '2' || status === '0') {
              portColor = '#C90000'; // Красный - down/offline
              portStatusText = '(0)';
            } else {
              // Неизвестный статус - оранжевый
              portColor = '#FFA500';
              portStatusText = `(${status})`;
            }
          }
          // Если статус не определён - оставляем чёрный цвет и прочерк

          // Цвет подписи через маппинг
          const descriptionColor = getMappedColor(port.color);

          // Для OLT используем label если есть, иначе number
          // Для обычных свитчей - number
          const portNumber = isOlt && port.label ? port.label : port.number;

          return (
            <View key={index} style={styles.portRow}>
              <Text style={[styles.portNumber, { color: portColor }]}>
                {portNumber}
              </Text>
              <Text style={[styles.portStatus, { color: portColor }]}>
                {portStatusText}
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
        <TouchableOpacity
          style={[styles.updateButton, isRefreshing && styles.updateButtonDisabled]}
          onPress={handleRefresh}
          disabled={isRefreshing}
        >
          {isRefreshing ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Text style={styles.updateButtonText}>Обновить</Text>
          )}
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
    minWidth: 80,
    alignItems: 'center',
  },
  updateButtonDisabled: {
    backgroundColor: '#A0A0A0',
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
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#111',
    borderRadius: 4,
    marginBottom: 12,
  },
  headerDetails: {
    flexDirection: 'column',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  headerLabel: {
    color: '#888',
    fontSize: 12,
    marginRight: 4,
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
    width: 66,  // +10%
  },
  portStatusCol: {
    width: 48,  // -20%
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
    width: 66,  // +10%
  },
  portStatus: {
    fontSize: 12,
    width: 48,  // -20%
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
