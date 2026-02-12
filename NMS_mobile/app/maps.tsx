import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../constants/theme';
import { useWebSocketContext } from '../context/WebSocketContext';

interface MapItem {
  filename: string;
  name: string;
  mod_time?: string;
  last_adm?: string;
}

interface Folder {
  name: string;
  path: string;
}

export default function MapsScreen() {
  const router = useRouter();
  const { isConnected, sendRequest, addConnectionHandler } = useWebSocketContext();

  const [maps, setMaps] = useState<MapItem[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Загрузка...');

  useEffect(() => {
    const removeHandler = addConnectionHandler((connected) => {
      if (connected) {
        setStatusMessage('Подключено');
        loadMaps();
      } else {
        setStatusMessage('Отключено от сервера');
      }
    });

    if (isConnected) {
      loadMaps();
    }

    return () => {
      removeHandler();
    };
  }, []);

  const loadMaps = async (folder?: string | null) => {
    try {
      setStatusMessage('Загрузка карт...');

      // Запрос списка карт с метаданными
      const response = await sendRequest('list_maps_with_metadata', {
        folder: folder || undefined,
      });

      if (response.success) {
        setMaps(response.maps || []);
        setStatusMessage(`Найдено карт: ${response.count || 0}`);
      } else {
        setStatusMessage('Ошибка загрузки карт');
        setMaps([]);
      }

      // Также загружаем список папок (если в корне)
      if (!folder) {
        const foldersResponse = await sendRequest('list_folders');
        if (foldersResponse.success && foldersResponse.folders) {
          setFolders(foldersResponse.folders.map((f: string) => ({ name: f, path: f })));
        }
      }
    } catch (error) {
      console.error('Error loading maps:', error);
      setStatusMessage('Ошибка подключения');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadMaps(currentFolder);
  };

  const handleFolderPress = (folder: Folder) => {
    setCurrentFolder(folder.path);
    setIsLoading(true);
    loadMaps(folder.path);
  };

  const handleBackToRoot = () => {
    setCurrentFolder(null);
    setIsLoading(true);
    loadMaps(null);
  };

  const handleMapPress = (map: MapItem) => {
    // Формируем путь к карте
    const mapPath = currentFolder
      ? `maps/${currentFolder}/${map.filename}`
      : `maps/${map.filename}`;

    router.push({
      pathname: '/canvas',
      params: {
        mapPath: mapPath,
        mapName: map.name,
      },
    } as any);
  };

  const renderMapItem = ({ item }: { item: MapItem }) => (
    <TouchableOpacity
      style={styles.mapCard}
      onPress={() => handleMapPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.mapIcon}>
        <Text style={styles.mapIconText}>🗺</Text>
      </View>
      <View style={styles.mapInfo}>
        <Text style={styles.mapName}>{item.name}</Text>
        {item.mod_time && item.mod_time !== 'Неизвестно' && (
          <Text style={styles.mapMeta}>Изменено: {item.mod_time}</Text>
        )}
        {item.last_adm && item.last_adm !== 'Неизвестно' && (
          <Text style={styles.mapMeta}>Редактор: {item.last_adm}</Text>
        )}
      </View>
      <Text style={styles.mapArrow}>›</Text>
    </TouchableOpacity>
  );

  const renderFolderItem = ({ item }: { item: Folder }) => (
    <TouchableOpacity
      style={styles.folderCard}
      onPress={() => handleFolderPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.folderIcon}>
        <Text style={styles.folderIconText}>📁</Text>
      </View>
      <Text style={styles.folderName}>{item.name}</Text>
      <Text style={styles.mapArrow}>›</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => (currentFolder ? handleBackToRoot() : router.back())}
          style={styles.backButton}
        >
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {currentFolder ? `Карты / ${currentFolder}` : 'Карты'}
        </Text>
        <View style={styles.headerRight} />
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Загрузка...</Text>
        </View>
      ) : (
        <FlatList
          data={[...folders.map((f) => ({ ...f, isFolder: true })), ...maps.map((m) => ({ ...m, isFolder: false }))]}
          renderItem={({ item }) =>
            (item as any).isFolder
              ? renderFolderItem({ item: item as Folder })
              : renderMapItem({ item: item as MapItem })
          }
          keyExtractor={(item, index) =>
            (item as any).isFolder ? `folder-${(item as Folder).path}` : `map-${(item as MapItem).filename}-${index}`
          }
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
              <Text style={styles.emptyText}>Карты не найдены</Text>
            </View>
          }
        />
      )}

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
  backButton: {
    paddingVertical: 4,
    paddingRight: 12,
  },
  backText: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: 'bold',
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  headerRight: {
    width: 40,
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
  folderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  folderIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  folderIconText: {
    fontSize: 20,
  },
  folderName: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  mapCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  mapIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#2a2a2a',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  mapIconText: {
    fontSize: 20,
  },
  mapInfo: {
    flex: 1,
  },
  mapName: {
    color: COLORS.textWhite,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  mapMeta: {
    color: COLORS.textGray,
    fontSize: 12,
  },
  mapArrow: {
    color: COLORS.textGray,
    fontSize: 24,
    marginLeft: 8,
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
});
