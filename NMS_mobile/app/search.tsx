import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { useWebSocketContext } from '../context/WebSocketContext';

interface SearchResult {
  index: number;
  name: string;
  map: string;
  mapPath: string;
  type: string;
  found: string;
  nodeId: string;
  nodeX: number;
  nodeY: number;
}

interface MapData {
  map: {
    name: string;
  };
  switches?: any[];
  plan_switches?: any[];
  users?: any[];
  soaps?: any[];
}

export default function SearchScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { isConnected, sendRequest, addConnectionHandler } = useWebSocketContext();

  // Check if user has edit_maps permission
  const canEditMaps = user?.permissions?.edit_maps === true;

  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Введите поисковый запрос');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  useEffect(() => {
    const removeHandler = addConnectionHandler((connected) => {
      if (connected) {
        setStatusMessage('Подключено');
      } else {
        setStatusMessage('Отключено от сервера');
      }
    });

    return () => {
      removeHandler();
    };
  }, []);

  // Нормализация MAC адреса для поиска
  const normalizeMac = (mac: string): string => {
    if (!mac) return '';
    return mac.toLowerCase().replace(/[:\-\.]/g, '');
  };

  // Поиск в узле (свитч/клиент)
  const searchInNode = (
    node: any,
    nodeType: string,
    mapName: string,
    mapPath: string,
    query: string,
    results: SearchResult[],
    index: number
  ): number => {
    const nodeName = (node.name || '').replace(/\n/g, ' ').trim();
    const nodeIp = node.ip || '';
    const foundItems: string[] = [];

    // Поиск по имени
    if (nodeName.toLowerCase().includes(query)) {
      foundItems.push(nodeName);
    }

    // Поиск по IP
    if (nodeIp && nodeIp.toLowerCase().includes(query)) {
      foundItems.push(nodeIp);
    }

    // Поиск по модели
    const nodeModel = node.model || '';
    if (nodeModel && nodeModel.toLowerCase().includes(query)) {
      foundItems.push(`модель: ${nodeModel}`);
    }

    // Поиск по MAC адресу
    const nodeMac = node.mac || '';
    if (nodeMac) {
      const normalizedQuery = normalizeMac(query);
      const normalizedMac = normalizeMac(nodeMac);
      if (normalizedQuery && normalizedMac.includes(normalizedQuery)) {
        foundItems.push(`mac: ${nodeMac}`);
      }
    }

    // Поиск в description портов
    const ports = node.ports || [];
    for (const port of ports) {
      const description = port.description || '';
      if (description && description.toLowerCase().includes(query)) {
        foundItems.push(`комментарий: ${description}`);
      }
    }

    // Добавляем результат если что-то найдено
    if (foundItems.length > 0) {
      const displayName = nodeIp ? `${nodeName} (${nodeIp})` : nodeName;
      const uniqueFound = [...new Set(foundItems)];
      const foundText = uniqueFound.length === 1
        ? uniqueFound[0]
        : uniqueFound.slice(0, 3).join('; ');

      results.push({
        index: index + 1,
        name: displayName,
        map: mapName,
        mapPath: mapPath,
        type: nodeType,
        found: foundText,
        nodeId: node.id,
        nodeX: node.xy?.x || 0,
        nodeY: node.xy?.y || 0,
      });

      return index + 1;
    }

    return index;
  };

  // Выполнить поиск
  const performSearch = async () => {
    // Скрываем клавиатуру
    Keyboard.dismiss();

    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      setStatusMessage('Введите поисковый запрос');
      return;
    }

    if (!isConnected) {
      setStatusMessage('Нет подключения к серверу');
      return;
    }

    setIsSearching(true);
    setStatusMessage('Поиск...');
    setResults([]);

    try {
      // Запрашиваем поиск на сервере с учётом прав доступа
      const response = await sendRequest('search_objects', {
        query: query,
        folder: !canEditMaps ? 'main' : undefined,
        exclude_maps: !canEditMaps ? ['00_Core'] : undefined,
      });

      if (response.success && response.results) {
        // Сервер вернул результаты
        const searchResults: SearchResult[] = response.results.map((r: any, idx: number) => ({
          index: idx + 1,
          name: r.name,
          map: r.map,
          mapPath: r.mapPath || r.map_path,
          type: r.type,
          found: r.found,
          nodeId: r.nodeId || r.node_id,
          nodeX: r.nodeX || r.node_x || 0,
          nodeY: r.nodeY || r.node_y || 0,
        }));

        setResults(searchResults);
        setStatusMessage(`Найдено: ${searchResults.length}`);
      } else {
        // Если сервер не поддерживает поиск, делаем локальный поиск
        await performLocalSearch(query);
      }
    } catch (error) {
      console.error('Search error:', error);
      // Попробуем локальный поиск
      await performLocalSearch(query);
    } finally {
      setIsSearching(false);
    }
  };

  // Локальный поиск по загруженным картам
  const performLocalSearch = async (query: string) => {
    try {
      let allFolders: string[];

      // Если нет прав edit_maps - искать только в папке main
      if (!canEditMaps) {
        allFolders = ['main'];
      } else {
        // Получаем список всех папок
        const foldersResponse = await sendRequest('list_folders');
        const folders = foldersResponse.success ? foldersResponse.folders || [] : [];
        // Добавляем корневую папку
        allFolders = ['', ...folders];
      }

      const searchResults: SearchResult[] = [];
      let resultIndex = 0;

      for (const folder of allFolders) {
        // Получаем список карт в папке
        const mapsResponse = await sendRequest('list_maps_with_metadata', {
          folder: folder || undefined,
        });

        if (!mapsResponse.success || !mapsResponse.maps) continue;

        for (const mapInfo of mapsResponse.maps) {
          // Если нет прав edit_maps - пропускаем карту 00_Core
          if (!canEditMaps) {
            if (mapInfo.filename?.startsWith('00_Core') || mapInfo.name?.startsWith('00_Core')) {
              continue;
            }
          }

          // Загружаем данные карты
          const mapPath = folder
            ? `maps/${folder}/${mapInfo.filename}`
            : `maps/${mapInfo.filename}`;

          const mapResponse = await sendRequest('file_get', {
            path: mapPath,
          });

          if (!mapResponse.success || !mapResponse.data) continue;

          const mapData: MapData = mapResponse.data;
          const mapName = mapData.map?.name || mapInfo.name;

          // Поиск по свитчам
          for (const node of mapData.switches || []) {
            resultIndex = searchInNode(node, 'Свитч', mapName, mapPath, query, searchResults, resultIndex);
          }

          // Поиск по план-свитчам
          for (const node of mapData.plan_switches || []) {
            resultIndex = searchInNode(node, 'План-свитч', mapName, mapPath, query, searchResults, resultIndex);
          }

          // Поиск по клиентам
          for (const node of mapData.users || []) {
            resultIndex = searchInNode(node, 'Клиент', mapName, mapPath, query, searchResults, resultIndex);
          }

          // Поиск по мыльницам
          for (const node of mapData.soaps || []) {
            resultIndex = searchInNode(node, 'Мыльница', mapName, mapPath, query, searchResults, resultIndex);
          }
        }
      }

      setResults(searchResults);
      setStatusMessage(`Найдено: ${searchResults.length}`);
    } catch (error) {
      console.error('Local search error:', error);
      setStatusMessage('Ошибка поиска');
    }
  };

  // Переход к объекту на карте
  const handleResultPress = (result: SearchResult) => {
    router.push({
      pathname: '/canvas',
      params: {
        mapPath: result.mapPath,
        mapName: result.map,
        focusNodeId: result.nodeId,
        focusX: result.nodeX,
        focusY: result.nodeY,
      },
    } as any);
  };

  // Сортировка
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortAsc(!sortAsc);
    } else {
      setSortColumn(column);
      setSortAsc(true);
    }
  };

  // Отсортированные результаты
  const sortedResults = React.useMemo(() => {
    if (!sortColumn) return results;

    return [...results].sort((a, b) => {
      let valA: any = a[sortColumn as keyof SearchResult];
      let valB: any = b[sortColumn as keyof SearchResult];

      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [results, sortColumn, sortAsc]);

  // Получить индикатор сортировки
  const getSortIndicator = (column: string) => {
    if (sortColumn !== column) return '';
    return sortAsc ? ' ▲' : ' ▼';
  };

  // Рендер заголовка таблицы
  const renderHeader = () => (
    <View style={styles.tableHeader}>
      <TouchableOpacity
        style={[styles.headerCell, styles.cellName]}
        onPress={() => handleSort('name')}
      >
        <Text style={styles.headerText}>Имя{getSortIndicator('name')}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.headerCell, styles.cellFound]}
        onPress={() => handleSort('found')}
      >
        <Text style={styles.headerText}>Найдено{getSortIndicator('found')}</Text>
      </TouchableOpacity>
    </View>
  );

  // Рендер строки результата
  const renderResultItem = ({ item, index }: { item: SearchResult; index: number }) => {
    const rowStyle = index % 2 === 0 ? styles.rowEven : styles.rowOdd;

    return (
      <TouchableOpacity
        style={[styles.tableRow, rowStyle]}
        onPress={() => handleResultPress(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.cell, styles.cellName]}>
          <Text style={styles.cellText} numberOfLines={2}>{item.name}</Text>
        </View>
        <View style={[styles.cell, styles.cellFound]}>
          <Text style={styles.cellText} numberOfLines={2}>{item.found}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Поиск объектов</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Строка поиска */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Введите поисковый запрос..."
          placeholderTextColor={COLORS.textGray}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={performSearch}
        />
        <TouchableOpacity
          style={[styles.searchButton, isSearching && styles.searchButtonDisabled]}
          onPress={performSearch}
          disabled={isSearching}
        >
          {isSearching ? (
            <ActivityIndicator size="small" color={COLORS.background} />
          ) : (
            <Text style={styles.searchButtonText}>Найти</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Таблица результатов */}
      <View style={styles.tableContainer}>
        {renderHeader()}

        {results.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {isSearching ? 'Поиск...' : 'Нет результатов'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={sortedResults}
            renderItem={renderResultItem}
            keyExtractor={(item) => `${item.nodeId}-${item.index}`}
            style={styles.resultsList}
          />
        )}
      </View>

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
    backgroundColor: '#333',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#555',
  },
  backButton: {
    paddingVertical: 4,
    paddingRight: 12,
  },
  backText: {
    color: '#FFC107',
    fontSize: 24,
    fontWeight: 'bold',
  },
  headerTitle: {
    color: '#FFC107',
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  headerRight: {
    width: 40,
  },
  searchContainer: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    height: 44,
    backgroundColor: '#444',
    borderWidth: 1,
    borderColor: '#555',
    borderRadius: 4,
    paddingHorizontal: 12,
    color: '#FFC107',
    fontSize: 16,
  },
  searchButton: {
    backgroundColor: '#444',
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#555',
    minWidth: 80,
  },
  searchButtonDisabled: {
    opacity: 0.6,
  },
  searchButtonText: {
    color: '#FFC107',
    fontSize: 16,
    fontWeight: '600',
  },
  tableContainer: {
    flex: 1,
    margin: 12,
    marginTop: 0,
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#555',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#555',
    borderBottomWidth: 1,
    borderBottomColor: '#666',
  },
  headerCell: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  headerText: {
    color: '#FFC107',
    fontSize: 13,
    fontWeight: 'bold',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
  },
  rowEven: {
    backgroundColor: '#E8E8E8',
  },
  rowOdd: {
    backgroundColor: '#D0D0D0',
  },
  cell: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  cellText: {
    color: '#000',
    fontSize: 13,
  },
  cellName: {
    flex: 1,
  },
  cellFound: {
    flex: 1,
  },
  resultsList: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    paddingVertical: 40,
  },
  emptyText: {
    color: '#666',
    fontSize: 16,
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: '#222',
    borderTopWidth: 1,
    borderTopColor: '#555',
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
    color: '#999',
    fontSize: 14,
  },
});
